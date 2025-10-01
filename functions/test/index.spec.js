// --- MOCKING STRATEGY ---
// Mock the entire @google-cloud/vertexai library.
const mockGenerateContent = jest.fn();
jest.mock('@google-cloud/vertexai', () => ({
    VertexAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
            generateContent: mockGenerateContent,
        })),
    })),
}));

// Mock firebase-admin
jest.mock('firebase-admin', () => {
    const firestoreInstance = {
        runTransaction: jest.fn(),
        collection: jest.fn(() => ({
            doc: jest.fn((docId) => ({
                id: docId,
                path: `mockCollection/${docId}`
            }))
        }))
    };

    const firestore = jest.fn(() => firestoreInstance);

    firestore.FieldValue = {
        arrayUnion: (...args) => ({ _type: 'arrayUnion', values: args }),
        arrayRemove: (...args) => ({ _type: 'arrayRemove', values: args }),
    };

    return {
        apps: [],
        initializeApp: jest.fn(),
        firestore: firestore,
        auth: () => ({
            getUser: jest.fn().mockResolvedValue({ email: 'test@test.com', displayName: 'Test User' })
        })
    };
});
// --- END MOCKING ---

const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
const firebaseTest = require('firebase-functions-test')();
const { HttpsError } = require('firebase-functions/v1/https');

// Import the functions to be tested AFTER mocking
const { getNextEcrNumber, getAIAssistantPlan, executeTaskModificationPlan } = require('../index');

describe('getAIAssistantPlan', () => {
    beforeEach(() => {
        mockGenerateContent.mockClear();
        mockGenerateContent.mockResolvedValue({
            response: {
                candidates: [{
                    content: { parts: [{ text: JSON.stringify({ thoughtProcess: 'mock', executionPlan: [], thinkingSteps: [] }) }] }
                }]
            }
        });
    });

    test('should create a dependency link between two tasks', async () => {
        const plan = {
            thoughtProcess: "Understood. Creating dependency.",
            thinkingSteps: ["Identified Task A", "Identified Task B", "Creating dependency link"],
            executionPlan: [
                {
                    action: "UPDATE",
                    docId: "taskA_id",
                    updates: { dependsOn: ["taskB_id"], blocked: true },
                    originalTitle: "Task A"
                },
                {
                    action: "UPDATE",
                    docId: "taskB_id",
                    updates: { blocks: ["taskA_id"] },
                    originalTitle: "Task B"
                }
            ]
        };

        mockGenerateContent.mockResolvedValue({
            response: {
                candidates: [{
                    content: { parts: [{ text: JSON.stringify(plan) }] }
                }]
            }
        });

        const wrapped = firebaseTest.wrap(getAIAssistantPlan);
        const result = await wrapped({
            userPrompt: 'Task A depends on Task B',
            tasks: [
                { docId: 'taskA_id', title: 'Task A' },
                { docId: 'taskB_id', title: 'Task B' }
            ],
            currentDate: '2025-10-01'
        }, { auth: { uid: 'test-uid' } });

        expect(result.executionPlan).toHaveLength(2);
        expect(result.executionPlan[0]).toEqual(plan.executionPlan[0]);
        expect(result.executionPlan[1]).toEqual(plan.executionPlan[1]);
    });


    test('should throw unauthenticated error if user is not logged in', async () => {
        const wrapped = firebaseTest.wrap(getAIAssistantPlan);
        await expect(wrapped({}, {})).rejects.toThrow(
            new HttpsError('unauthenticated', 'The function must be called while authenticated.')
        );
    });

    test('should throw invalid-argument if currentDate is missing or invalid', async () => {
        const wrapped = firebaseTest.wrap(getAIAssistantPlan);
        const context = { auth: { uid: 'test-uid' } };
        const validData = { userPrompt: 'test', tasks: [] };

        await expect(wrapped({ ...validData }, context)).rejects.toThrow(
             new HttpsError('invalid-argument', "The function must be called with a valid 'currentDate' (YYYY-MM-DD).")
        );

        await expect(wrapped({ ...validData, currentDate: '01-10-2025' }, context)).rejects.toThrow(
             new HttpsError('invalid-argument', "The function must be called with a valid 'currentDate' (YYYY-MM-DD).")
        );
    });

    test('should include currentDate in the prompt sent to the AI', async () => {
        const wrapped = firebaseTest.wrap(getAIAssistantPlan);
        const context = { auth: { uid: 'test-uid' } };
        const testDate = '2025-10-01';
        const data = {
            userPrompt: 'Reprograma las tareas de ayer',
            tasks: [{ docId: '1', title: 'Tarea de ayer', status: 'todo', dueDate: '2025-09-30' }],
            currentDate: testDate
        };

        await wrapped(data, context);

        expect(mockGenerateContent).toHaveBeenCalledTimes(1);

        const promptSentToAI = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;

        expect(promptSentToAI).toContain(`La fecha de hoy es ${testDate}.`);
    });
});

describe('executeTaskModificationPlan', () => {
    let mockGet, mockUpdate, mockTransaction;

    beforeEach(() => {
        mockGet = jest.fn();
        mockUpdate = jest.fn();

        mockTransaction = {
            get: mockGet,
            update: mockUpdate,
            set: jest.fn(),
            delete: jest.fn()
        };

        admin.firestore.mockReturnValue({
            runTransaction: async (updateFunction) => {
                await updateFunction(mockTransaction);
            },
            collection: () => ({
                doc: (docId) => ({ id: docId, path: `tareas/${docId}` })
            }),
            FieldValue: {
                arrayUnion: (...args) => ({ _type: 'arrayUnion', values: args }),
                arrayRemove: (...args) => ({ _type: 'arrayRemove', values: args }),
            }
        });
    });

    test('should unblock a dependent task when its only dependency is completed', async () => {
        const plan = [
            {
                action: "UPDATE",
                docId: "taskB_id",
                updates: { status: "done" },
                originalTitle: "Task B (Prerequisite)"
            }
        ];

        // Mock the state of the tasks in the database
        mockGet.mockImplementation(ref => {
            if (ref.path === 'tareas/taskB_id') {
                return Promise.resolve({
                    exists: true,
                    data: () => ({
                        title: 'Task B (Prerequisite)',
                        status: 'inprogress',
                        blocks: ['taskA_id']
                    })
                });
            }
            if (ref.path === 'tareas/taskA_id') {
                return Promise.resolve({
                    exists: true,
                    data: () => ({
                        title: 'Task A (Dependent)',
                        status: 'todo',
                        blocked: true,
                        dependsOn: ['taskB_id']
                    })
                });
            }
            return Promise.resolve({ exists: false });
        });

        const wrapped = firebaseTest.wrap(executeTaskModificationPlan);
        await wrapped({ plan }, { auth: { uid: 'test-uid' } });

        // Verify that Task B was marked as done and its 'blocks' array was cleared
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'taskB_id' }),
            expect.objectContaining({ status: 'done' })
        );
         expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'taskB_id' }),
            expect.objectContaining({ blocks: [] })
        );

        // Verify that Task A was unblocked and its dependency was removed
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'taskA_id' }),
            expect.objectContaining({
                blocked: false,
                dependsOn: { _type: 'arrayRemove', values: ['taskB_id'] }
            })
        );
    });
});


describe('getNextEcrNumber', () => {
  let mockGet;
  let mockSet;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn();

    admin.firestore.mockReturnValue({
      runTransaction: (updateFunction) => {
        const mockTransaction = {
          get: mockGet,
          set: mockSet,
        };
        return updateFunction(mockTransaction);
      },
      collection: () => ({
        doc: () => ({}),
      }),
    });
  });

  test('should start at 1 for a new year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear - 1, count: 123 }) });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should increment the counter for the current year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear, count: 5 }) });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 6, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-006`);
  });

  test('should start at 1 if counter document does not exist', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: false });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should throw unauthenticated error if no auth context', async () => {
    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    await expect(wrapped({}, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });
});
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
jest.mock('firebase-admin', () => ({
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn(),
    auth: () => ({
        getUser: jest.fn().mockResolvedValue({ email: 'test@test.com', displayName: 'Test User' })
    })
}));
// --- END MOCKING ---

const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
const firebaseTest = require('firebase-functions-test')();
const { HttpsError } = require('firebase-functions/v1/https');

// Import the functions to be tested AFTER mocking
const { getNextEcrNumber, getAIAssistantPlan } = require('../index');

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
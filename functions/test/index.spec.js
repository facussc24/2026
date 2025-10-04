// --- MOCKING STRATEGY ---
const mockGenerateContent = jest.fn();
jest.mock('@google-cloud/vertexai', () => ({
    VertexAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
            generateContent: mockGenerateContent,
        })),
    })),
}));

jest.mock('firebase-admin', () => {
    const mockBatch = {
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue({ success: true }),
    };

    const firestoreInstance = {
        runTransaction: jest.fn(),
        collection: jest.fn(() => ({
            doc: jest.fn((docId) => ({
                id: docId || `mock-doc-${Math.random()}`,
                path: `mockCollection/${docId}`,
                update: jest.fn().mockResolvedValue(true),
                set: jest.fn().mockResolvedValue(true),
            })),
            where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [] })
            }))
        })),
        batch: () => mockBatch, // Add batch mock here
    };

    const firestore = jest.fn(() => firestoreInstance);
    firestore.FieldValue = {
        arrayUnion: (...args) => ({ _type: 'arrayUnion', values: args }),
        arrayRemove: (...args) => ({ _type: 'arrayRemove', values: args }),
        serverTimestamp: jest.fn(),
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

const { describe, beforeEach, afterEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
const firebaseTest = require('firebase-functions-test')();
const crypto = require('crypto');

// Import the functions to be tested AFTER mocking
const { executeTaskModificationPlan, aiAgentJobRunner } = require('../index');

describe('aiAgentJobRunner', () => {
    let mockJobRef;

    beforeEach(() => {
        // Reset mocks before each test
        mockGenerateContent.mockClear();

        // Mock the job document reference
        mockJobRef = {
            update: jest.fn().mockResolvedValue(true),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should proactively schedule a new task on the least busy day', async () => {
        // 1. Setup
        const tasks = [
            { docId: 'task-1', title: 'Existing Task 1', status: 'todo', plannedDate: '2025-10-03' },
            { docId: 'task-2', title: 'Existing Task 2', status: 'todo', plannedDate: '2025-10-03' },
            { docId: 'task-3', title: 'Existing Task 3', status: 'todo', plannedDate: '2025-10-04' },
        ];

        const userPrompt = 'Crear una nueva tarea para revisar el informe de marketing';
        const currentDate = '2025-10-02'; // Today

        // Mock the AI's response
        // 1st response: The AI decides to create a task and schedules it on the least busy day (2025-10-04)
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                thought: "El usuario quiere crear una tarea. Analizando el calendario, veo que el 2025-10-03 tiene 2 tareas y el 2025-10-04 solo una. Planificaré la nueva tarea para el 2025-10-04 para balancear la carga.",
                                tool_code: {
                                    tool_id: "create_task",
                                    parameters: {
                                        title: "Revisar el informe de marketing",
                                        plannedDate: "2025-10-04"
                                    }
                                }
                            })
                        }]
                    }
                }]
            }
        });

        // 2nd response: The AI finishes the job
        mockGenerateContent.mockResolvedValueOnce({
             response: {
                candidates: [{
                    content: {
                        parts: [{
                             text: JSON.stringify({
                                thought: "He creado la tarea. Mi trabajo está completo.",
                                tool_code: { tool_id: "finish", parameters: {} }
                            })
                        }]
                    }
                }]
            }
        });

        // 2. Execution
        const snap = {
            ref: mockJobRef,
            data: () => ({
                userPrompt,
                tasks,
                allUsers: [],
                currentDate,
                conversationHistory: [],
                executionPlan: [],
                thinkingSteps: [],
                summary: ''
            })
        };

        // We need to use the wrapped function for Firestore triggers
        const wrapped = firebaseTest.wrap(aiAgentJobRunner);
        await wrapped(snap);

        // 3. Assertions
        // Check that the job status was updated to RUNNING and then COMPLETED
        expect(mockJobRef.update).toHaveBeenCalledWith({ status: 'RUNNING' });

        // Get the final update call to check the executionPlan
        const finalUpdateCall = mockJobRef.update.mock.calls.find(call => call[0].status === 'AWAITING_CONFIRMATION');
        expect(finalUpdateCall).toBeDefined();

        const finalPlan = finalUpdateCall[0].executionPlan;

        // The plan should have one 'CREATE' action
        expect(finalPlan).toHaveLength(1);
        expect(finalPlan[0].action).toBe('CREATE');

        // The created task should have the plannedDate chosen by the AI
        expect(finalPlan[0].task.title).toBe("Revisar el informe de marketing");
        expect(finalPlan[0].task.plannedDate).toBe("2025-10-04"); // The crucial check
        expect(finalPlan[0].task.dueDate).toBeUndefined(); // Ensure dueDate was not set
        expect(finalUpdateCall[0].awaitingUserConfirmation).toBe(true);
    });

    test('generates unique temporary IDs for consecutive task creations', async () => {
        const userPrompt = 'Crear dos tareas dependientes para la campaña.';
        const tasks = [];
        const currentDate = '2025-05-01';
        const jobId = 'job-123';

        const randomUUIDSpy = jest.spyOn(crypto, 'randomUUID');
        randomUUIDSpy
            .mockReturnValueOnce('uuid-1')
            .mockReturnValueOnce('uuid-2');

        const firstTempId = `temp_${jobId}_uuid-1`;
        const secondTempId = `temp_${jobId}_uuid-2`;

        mockGenerateContent
            .mockResolvedValueOnce({
                response: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    thought: 'Crearé la primera tarea.',
                                    tool_code: {
                                        tool_id: 'create_task',
                                        parameters: {
                                            title: 'Diseñar campaña',
                                            plannedDate: currentDate,
                                        },
                                    },
                                }),
                            }],
                        },
                    }],
                },
            })
            .mockResolvedValueOnce({
                response: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    thought: 'Crearé la segunda tarea.',
                                    tool_code: {
                                        tool_id: 'create_task',
                                        parameters: {
                                            title: 'Aprobar campaña',
                                            plannedDate: '2025-05-02',
                                        },
                                    },
                                }),
                            }],
                        },
                    }],
                },
            })
            .mockResolvedValueOnce({
                response: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    thought: 'Configuraré la dependencia.',
                                    tool_code: {
                                        tool_id: 'create_dependency',
                                        parameters: {
                                            dependent_task_id: secondTempId,
                                            prerequisite_task_id: firstTempId,
                                        },
                                    },
                                }),
                            }],
                        },
                    }],
                },
            })
            .mockResolvedValueOnce({
                response: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    thought: 'Resumiré el plan.',
                                    tool_code: {
                                        tool_id: 'review_and_summarize_plan',
                                        parameters: {},
                                    },
                                }),
                            }],
                        },
                    }],
                },
            })
            .mockResolvedValueOnce({
                response: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    thought: 'Plan finalizado.',
                                    tool_code: { tool_id: 'finish', parameters: {} },
                                }),
                            }],
                        },
                    }],
                },
            });

        const snap = {
            ref: mockJobRef,
            data: () => ({
                userPrompt,
                tasks,
                allUsers: [],
                currentDate,
                conversationHistory: [],
                executionPlan: [],
                thinkingSteps: [],
                summary: '',
            }),
        };

        const wrapped = firebaseTest.wrap(aiAgentJobRunner);
        await wrapped(snap, { params: { jobId } });

        expect(randomUUIDSpy).toHaveBeenCalledTimes(2);

        const finalUpdateCall = mockJobRef.update.mock.calls.find((call) => call[0].status === 'AWAITING_CONFIRMATION');
        expect(finalUpdateCall).toBeDefined();

        const { executionPlan } = finalUpdateCall[0];
        const createActions = executionPlan.filter((action) => action.action === 'CREATE');
        expect(createActions).toHaveLength(2);
        const tempIds = createActions.map((action) => action.docId);
        expect(new Set(tempIds).size).toBe(2);
        expect(tempIds).toContain(firstTempId);
        expect(tempIds).toContain(secondTempId);

        const dependencyUpdate = executionPlan.find(
            (action) => action.action === 'UPDATE' && action.updates && action.updates.dependsOn,
        );
        expect(dependencyUpdate).toBeDefined();
        expect(dependencyUpdate.docId).toBe(secondTempId);
        expect(dependencyUpdate.updates.dependsOn).toEqual([firstTempId]);
    });
});

describe('executeTaskModificationPlan', () => {
    let mockBatch;
    let mockDoc;

    beforeEach(() => {
        // Reset mocks for each test
        mockBatch = {
            set: jest.fn(),
            update: jest.fn(),
            commit: jest.fn().mockResolvedValue({ success: true }),
        };

        const firestore = admin.firestore();
        firestore.batch = jest.fn(() => mockBatch);

        let docCounter = 0;
        mockDoc = jest.fn((docId) => {
            const realId = docId || `real-doc-${docCounter++}`;
            return {
                id: realId,
                path: `tareas/${realId}`,
            };
        });
        firestore.collection = jest.fn(() => ({
            doc: mockDoc,
        }));
    });

    test('should execute a plan with temporary IDs and resolve dependencies correctly', async () => {
        const plan = [
            { action: 'CREATE', docId: 'temp_001', task: { title: 'Task A' } },
            { action: 'CREATE', docId: 'temp_002', task: { title: 'Task B' } },
            { action: 'UPDATE', docId: 'temp_002', updates: { dependsOn: ['temp_001'] } },
            { action: 'UPDATE', docId: 'temp_001', updates: { blocks: ['temp_002'] } }
        ];

        const wrapped = firebaseTest.wrap(executeTaskModificationPlan);
        const result = await wrapped({ plan }, { auth: { uid: 'test-uid' } });

        // --- ASSERTIONS ---
        expect(mockBatch.set).toHaveBeenCalledTimes(2);
        expect(mockBatch.update).toHaveBeenCalledTimes(2);
        expect(mockBatch.commit).toHaveBeenCalledTimes(1);

        const updateCallForTaskB = mockBatch.update.mock.calls.find(call => call[0].id === 'real-doc-1');
        const updateCallForTaskA = mockBatch.update.mock.calls.find(call => call[0].id === 'real-doc-0');

        expect(updateCallForTaskB).toBeDefined();
        expect(updateCallForTaskB[1].dependsOn).toEqual({
            _type: 'arrayUnion',
            values: ['real-doc-0']
        });

        expect(updateCallForTaskA).toBeDefined();
        expect(updateCallForTaskA[1].blocks).toEqual({
            _type: 'arrayUnion',
            values: ['real-doc-1']
        });

        expect(result.success).toBe(true);
    });
});
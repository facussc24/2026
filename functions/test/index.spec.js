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

// Import the functions to be tested AFTER mocking
const { aiProjectAgent, executeTaskModificationPlan } = require('../index');

describe('aiProjectAgent', () => {
    beforeEach(() => {
        mockGenerateContent.mockClear();
        if (jest.isMockFunction(Date.now)) {
            Date.now.mockRestore();
        }
    });

    test('should use the review_and_summarize_plan tool as a final step', async () => {
        mockGenerateContent
            // 1. Create a task
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Voy a crear la primera tarea.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Tarea Única' } }
            }) }] } }] } })
            // 2. Review and Summarize
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "He creado la tarea. Ahora voy a resumir el plan.",
                tool_code: { tool_id: 'review_and_summarize_plan', parameters: { summary: "He creado una única tarea para empezar." } }
            }) }] } }] } })
            // 3. Finish
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "He resumido el plan. Mi trabajo está completo.",
                tool_code: { tool_id: 'finish', parameters: {} }
            }) }] } }] } });

        const wrapped = firebaseTest.wrap(aiProjectAgent);
        const result = await wrapped({
            userPrompt: 'Crea una tarea simple',
            tasks: [],
            currentDate: '2025-10-01'
        }, { auth: { uid: 'test-uid' } });

        // --- ASSERTIONS ---
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
        // Check that the summary is prioritized in the final output
        expect(result.thoughtProcess).toContain('Resumen del Plan de la IA');
        expect(result.thoughtProcess).toContain('He creado una única tarea para empezar.');
        // Check that the execution plan is still correct
        expect(result.executionPlan).toHaveLength(1);
        expect(result.executionPlan[0].action).toBe('CREATE');
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
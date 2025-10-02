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
const { HttpsError } = require('firebase-functions/v1/https');

// Import the functions to be tested AFTER mocking
const { aiProjectAgent } = require('../index');

describe('aiProjectAgent', () => {
    beforeEach(() => {
        mockGenerateContent.mockClear();
        // Restore Date.now mock if it was spied on
        if (jest.isMockFunction(Date.now)) {
            Date.now.mockRestore();
        }
    });

    test('should generate a multi-step plan using the ReAct loop', async () => {
        // Mock the multi-step conversation
        mockGenerateContent
            // 1. Thought: Create first task
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "I need to create the first task: 'Investigar sobre marketing'.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Investigar sobre marketing' } }
            }) }] } }] } })
            // 2. Thought: Create second task
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Task 1 created. Now I need to create the second task: 'Escribir borrador'.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Escribir borrador' } }
            }) }] } }] } })
             // 3. Thought: Create dependency
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Tasks created. Now I need to link them. The dependent task is 'Escribir borrador' and the prerequisite is 'Investigar sobre marketing'. I'll use their temporary IDs.",
                tool_code: { tool_id: 'create_dependency', parameters: { dependent_task_id: 'temp_123456', prerequisite_task_id: 'temp_123455' } }
            }) }] } }] } })
            // 4. Thought: Finish
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Dependency created. The plan is complete.",
                tool_code: { tool_id: 'finish', parameters: {} }
            }) }] } }] } });

        // Mock Date.now() to make temporary IDs predictable
        let dateNow = 123455;
        jest.spyOn(Date, 'now').mockImplementation(() => dateNow++);

        const wrapped = firebaseTest.wrap(aiProjectAgent);
        const result = await wrapped({
            userPrompt: 'Crea un post sobre marketing',
            tasks: [],
            currentDate: '2025-10-01'
        }, { auth: { uid: 'test-uid' } });

        expect(mockGenerateContent).toHaveBeenCalledTimes(4);
        expect(result.executionPlan).toHaveLength(4); // 2 CREATE, 2 UPDATE for dependency
        expect(result.executionPlan[0].action).toBe('CREATE');
        expect(result.executionPlan[1].action).toBe('CREATE');
        expect(result.executionPlan[2].action).toBe('UPDATE');
        expect(result.executionPlan[2].updates.dependsOn).toEqual(['temp_123455']);
    });

    test('should handle a simple, single-step task creation', async () => {
        mockGenerateContent
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "The user wants to create a simple task. I will use the create_task tool.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Llamar al proveedor' } }
            }) }] } }] } })
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "The task is created. I am finished.",
                tool_code: { tool_id: 'finish', parameters: {} }
            }) }] } }] } });

        const wrapped = firebaseTest.wrap(aiProjectAgent);
        const result = await wrapped({
            userPrompt: 'Llamar al proveedor',
            tasks: [],
            currentDate: '2025-10-01'
        }, { auth: { uid: 'test-uid' } });

        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
        expect(result.executionPlan).toHaveLength(1);
        expect(result.executionPlan[0].action).toBe('CREATE');
        expect(result.executionPlan[0].task.title).toBe('Llamar al proveedor');
    });
});
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

    test('should correctly use tools to create tasks and then create a dependency between them using their IDs', async () => {
        // This test simulates a more realistic ReAct loop where the agent must find tasks to get their IDs before creating a dependency.

        mockGenerateContent
            // 1. Agent decides to create the first task.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "El usuario quiere un proceso AMFE. El primer paso es definir el alcance. Crearé esa tarea.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Definir el Alcance del AMFE' } }
            }) }] } }] } })
            // 2. Agent acknowledges the first task and creates the second.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "La primera tarea ha sido creada. Ahora, crearé la segunda tarea para formar el equipo.",
                tool_code: { tool_id: 'create_task', parameters: { title: 'Formar el Equipo Multidisciplinario' } }
            }) }] } }] } })
             // 3. Agent decides to find the FIRST task to create a dependency later.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Tengo dos tareas. Ahora necesito enlazarlas. Primero, encontraré la tarea 'Formar el Equipo' para que dependa de 'Definir el Alcance'. Buscaré 'Formar el Equipo'.",
                tool_code: { tool_id: 'find_task', parameters: { query: 'Formar el Equipo Multidisciplinario' } }
            }) }] } }] } })
            // 4. Agent decides to find the SECOND task.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Encontré la tarea 'Formar el Equipo'. Ahora necesito el ID de la tarea prerrequisito, 'Definir el Alcance'.",
                tool_code: { tool_id: 'find_task', parameters: { query: 'Definir el Alcance del AMFE' } }
            }) }] } }] } })
            // 5. Agent has both IDs and creates the dependency.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "Tengo ambos IDs. Ahora crearé la dependencia donde 'Formar el Equipo' (temp_123456) depende de 'Definir el Alcance' (temp_123455).",
                tool_code: { tool_id: 'create_dependency', parameters: { dependent_task_id: 'temp_123456', prerequisite_task_id: 'temp_123455' } }
            }) }] } }] } })
            // 6. Agent finishes the process.
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify({
                thought: "La dependencia ha sido creada. El plan inicial está completo.",
                tool_code: { tool_id: 'finish', parameters: {} }
            }) }] } }] } });

        // Mock Date.now() to make temporary IDs predictable
        let dateNow = 123455;
        jest.spyOn(Date, 'now').mockImplementation(() => dateNow++);

        const wrapped = firebaseTest.wrap(aiProjectAgent);
        const result = await wrapped({
            userPrompt: 'Inicia un proceso AMFE',
            tasks: [], // Start with no existing tasks
            currentDate: '2025-10-01'
        }, { auth: { uid: 'test-uid' } });

        // --- ASSERTIONS ---
        expect(mockGenerateContent).toHaveBeenCalledTimes(6);
        expect(result.executionPlan).toHaveLength(4); // 2 CREATE actions, 2 UPDATE actions for the dependency

        // Verify the CREATE actions
        expect(result.executionPlan[0].action).toBe('CREATE');
        expect(result.executionPlan[0].docId).toBe('temp_123455');
        expect(result.executionPlan[0].task.title).toBe('Definir el Alcance del AMFE');

        expect(result.executionPlan[1].action).toBe('CREATE');
        expect(result.executionPlan[1].docId).toBe('temp_123456');
        expect(result.executionPlan[1].task.title).toBe('Formar el Equipo Multidisciplinario');

        // Verify the UPDATE actions for the dependency
        const dependentUpdate = result.executionPlan.find(a => a.docId === 'temp_123456' && a.action === 'UPDATE');
        const prerequisiteUpdate = result.executionPlan.find(a => a.docId === 'temp_123455' && a.action === 'UPDATE');

        expect(dependentUpdate).toBeDefined();
        expect(dependentUpdate.updates.dependsOn).toEqual(['temp_123455']);
        expect(dependentUpdate.updates.blocked).toBe(true);

        expect(prerequisiteUpdate).toBeDefined();
        expect(prerequisiteUpdate.updates.blocks).toEqual(['temp_123456']);

        // Verify the thought process translation
        expect(result.thoughtProcess).toContain('Proceso de Pensamiento del Agente');
        expect(result.thoughtProcess).toContain('El usuario quiere un proceso AMFE');
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
            // If a docId is provided, use it. Otherwise, generate a predictable new one.
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

        // Verify CREATE calls (Note: mockDoc generates predictable IDs 'real-doc-0', 'real-doc-1')
        expect(mockBatch.set.mock.calls[0][0].id).toBe('real-doc-0'); // Task A's real doc ref
        expect(mockBatch.set.mock.calls[0][1].title).toBe('Task A');  // Task A's data
        expect(mockBatch.set.mock.calls[1][0].id).toBe('real-doc-1'); // Task B's real doc ref
        expect(mockBatch.set.mock.calls[1][1].title).toBe('Task B');  // Task B's data

        // Verify UPDATE calls (the core of the test)
        const updateCallForTaskB = mockBatch.update.mock.calls.find(call => call[0].id === 'real-doc-1');
        const updateCallForTaskA = mockBatch.update.mock.calls.find(call => call[0].id === 'real-doc-0');

        expect(updateCallForTaskB).toBeDefined();
        expect(updateCallForTaskB[1].dependsOn).toEqual({
            _type: 'arrayUnion',
            values: ['real-doc-0'] // Check that temp_001 was resolved to real-doc-0
        });

        expect(updateCallForTaskA).toBeDefined();
        expect(updateCallForTaskA[1].blocks).toEqual({
            _type: 'arrayUnion',
            values: ['real-doc-1'] // Check that temp_002 was resolved to real-doc-1
        });

        expect(result.success).toBe(true);
    });
});
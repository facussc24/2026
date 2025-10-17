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
        collection: jest.fn((collectionName) => ({
            doc: jest.fn((docId) => {
                const newId = docId || `mock-doc-${Math.random()}`;
                return {
                    id: newId,
                    path: `${collectionName}/${newId}`,
                    update: jest.fn().mockResolvedValue(true),
                    set: jest.fn().mockResolvedValue(true),
                    get: jest.fn().mockResolvedValue({
                        exists: true,
                        data: () => ({ creatorUid: 'test-uid' }) // Default for security checks
                    }),
                };
            }),
            where: jest.fn(() => ({
                get: jest.fn().mockResolvedValue({ docs: [] })
            }))
        })),
        batch: () => mockBatch,
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
const crypto = require('crypto');

// Set a mock project ID before importing functions
process.env.GCLOUD_PROJECT = 'test-project';

// Import the functions to be tested AFTER mocking
const { _executePlan, _runAgentLogic, getCurrentDateForUserTZ } = require('../index');

describe('_runAgentLogic', () => {
    let mockJobRef;
    let mockGenerativeModel;

    beforeEach(() => {
        // Reset mocks before each test
        mockGenerativeModel = {
            generateContent: jest.fn(),
        };

        mockJobRef = {
            update: jest.fn().mockResolvedValue(true),
            set: jest.fn().mockResolvedValue(true),
        };

        const { VertexAI } = require('@google-cloud/vertexai');
        VertexAI.mockImplementation(() => ({
            getGenerativeModel: () => mockGenerativeModel,
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should proactively schedule a new task on the least busy day', async () => {
        const tasks = [
            { docId: 'task-1', title: 'Existing Task 1', status: 'todo', plannedDate: '2025-10-03' },
            { docId: 'task-2', title: 'Existing Task 2', status: 'todo', plannedDate: '2025-10-03' },
            { docId: 'task-3', title: 'Existing Task 3', status: 'todo', plannedDate: '2025-10-04' },
        ];
        const userPrompt = 'Crear una nueva tarea para revisar el informe de marketing';
        const currentDate = getCurrentDateForUserTZ({ date: new Date('2025-10-02T15:00:00Z') });

        mockGenerativeModel.generateContent.mockResolvedValueOnce({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ thought: "Planificaré la nueva tarea para el 2025-10-04.", tool_code: { tool_id: "create_task", parameters: { title: "Revisar el informe de marketing", plannedDate: "2025-10-04" } } }) }] } }] }
        }).mockResolvedValueOnce({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ thought: "He creado la tarea.", tool_code: { tool_id: "finish", parameters: {} } }) }] } }] }
        });

        const jobData = { userPrompt, tasks, allUsers: [], currentDate, conversationHistory: [], executionPlan: [], thinkingSteps: [], summary: '' };
        await _runAgentLogic(jobData, mockJobRef, 'test-job');

        expect(mockJobRef.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'RUNNING' }));
        const finalUpdateCall = mockJobRef.update.mock.calls.find(call => call[0].status === 'AWAITING_CONFIRMATION');
        expect(finalUpdateCall).toBeDefined();
        const finalPlan = finalUpdateCall[0].executionPlan;

        expect(finalPlan[0].task.title).toBe("Revisar el informe de marketing");
        expect(finalPlan[0].task.plannedDate).toBe("2025-10-06");
    });

    test('creates a single high-priority task with sanitized subtasks', async () => {
        const userPrompt = 'Crear tarea X con 2 subtareas y prioridad alta';
        const currentDate = getCurrentDateForUserTZ({ date: new Date('2025-03-10T12:00:00Z') });
        const randomUUIDSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValueOnce('temp-task-uuid').mockReturnValueOnce('subtask-uuid-1').mockReturnValueOnce('subtask-uuid-2');

        mockGenerativeModel.generateContent.mockResolvedValueOnce({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ thought: 'Crearé la tarea.', tool_code: { tool_id: 'create_task', parameters: { title: 'Tarea Prioritaria', plannedDate: currentDate, priority: 'high', subtasks: [{ title: 'Preparar informe' }, { title: 'Revisar informe' }] } } }) }] } }] }
        }).mockResolvedValueOnce({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ thought: 'Plan listo.', tool_code: { tool_id: 'finish', parameters: {} } }) }] } }] }
        });

        const jobData = { userPrompt, tasks: [], allUsers: [], currentDate, conversationHistory: [], executionPlan: [], thinkingSteps: [], summary: '', creatorUid: 'test-uid' };
        await _runAgentLogic(jobData, mockJobRef, 'job-priority');

        const finalUpdateCall = mockJobRef.update.mock.calls.find((call) => call[0].status === 'AWAITING_CONFIRMATION');
        expect(finalUpdateCall).toBeDefined();
        const [createAction] = finalUpdateCall[0].executionPlan;
        expect(createAction.task.priority).toBe('high');
        expect(createAction.task.subtasks).toEqual([
            { id: 'subtask-uuid-1', title: 'Preparar informe', completed: false },
            { id: 'subtask-uuid-2', title: 'Revisar informe', completed: false },
        ]);
        randomUUIDSpy.mockRestore();
    });

    it('should handle permission errors gracefully in the agent loop and inform the user', async () => {
        const userPrompt = "Modifica la tarea 'Tarea de Otro' y ponle 'Título Malicioso'";
        const jobData = { userPrompt, tasks: [{ docId: 'task-of-another-user', title: 'Tarea de Otro', creatorUid: 'another-owner-uid' }], allUsers: [], creatorUid: 'test-uid', conversationHistory: [], executionPlan: [], thinkingSteps: [], summary: '', foundTasksContext: [] };

        const firstModelResponse = { thought: "Voy a intentar actualizar la tarea.", tool_code: { tool_id: 'update_task', parameters: { task_id: 'task-of-another-user', updates: { title: 'Título Malicioso' } } } };
        const secondModelResponse = { thought: "Recibí un error de permiso. Informaré al usuario.", tool_code: { tool_id: 'answer_question', parameters: { answer: "No tengo permiso para modificar la tarea 'Tarea de Otro', ya que no te pertenece." } } };

        mockGenerativeModel.generateContent
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify(firstModelResponse) }] } }] } })
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify(secondModelResponse) }] } }] } });

        const db = admin.firestore();
        const mockTaskSnap = { exists: true, data: () => ({ title: 'Tarea de Otro', creatorUid: 'another-owner-uid' }) };
        db.collection('tareas').doc('task-of-another-user').get.mockResolvedValue(mockTaskSnap);

        await _runAgentLogic(jobData, mockJobRef, 'test-job-id');

        const finalUpdateCall = mockJobRef.update.mock.calls.find(call => call[0].status === 'AWAITING_CONFIRMATION' || call[0].status === 'COMPLETED');
        expect(finalUpdateCall).toBeDefined();
        expect(finalUpdateCall[0].summary).toContain("No tengo permiso para modificar la tarea 'Tarea de Otro'");
    });

    test('should provide a helpful fallback message when the AI fails to generate a plan', async () => {
        const userPrompt = "Necesito que hagas algo, pero no estoy seguro de qué.";
        const jobData = { userPrompt, tasks: [], allUsers: [], creatorUid: 'test-uid', conversationHistory: [], executionPlan: [], thinkingSteps: [], summary: '', foundTasksContext: [] };

        // Simulate the AI being "confused" and not calling any tools, just thinking.
        const modelResponse = {
            thought: "No estoy seguro de qué hacer con esta solicitud. Es demasiado vaga.",
            tool_code: { tool_id: 'finish', parameters: {} } // The agent gives up.
        };

        mockGenerativeModel.generateContent
            .mockResolvedValueOnce({ response: { candidates: [{ content: { parts: [{ text: JSON.stringify(modelResponse) }] } }] } });

        await _runAgentLogic(jobData, mockJobRef, 'test-job-id-fallback');

        const finalUpdateCall = mockJobRef.update.mock.calls.find(call => call[0].status === 'COMPLETED');
        expect(finalUpdateCall).toBeDefined();

        // Check that the summary is the new, helpful fallback message.
        expect(finalUpdateCall[0].summary).toContain("No pude generar un plan de acción con tu última petición.");
        expect(finalUpdateCall[0].summary).toContain("Mi último pensamiento fue: \"No estoy seguro de qué hacer con esta solicitud. Es demasiado vaga.\"");
        expect(finalUpdateCall[0].summary).toContain("Por favor, intenta reformular tu solicitud con más detalles");
    });
});

describe('_executePlan', () => {
    let db;

    beforeEach(() => {
        db = admin.firestore();
    });

    it('should throw a permission error if a user tries to modify a task they do not own', async () => {
        const plan = [{
            action: 'UPDATE',
            docId: 'existing-task-id',
            updates: { title: 'Malicious New Title' }
        }];
        const maliciousUserUid = 'malicious-user-uid';
        const ownerUserUid = 'owner-user-uid';

        const mockTaskSnap = {
            exists: true,
            data: () => ({
                title: 'Original Title',
                creatorUid: ownerUserUid
            })
        };
        db.collection('tareas').doc('existing-task-id').get.mockResolvedValue(mockTaskSnap);

        await expect(_executePlan(db, plan, maliciousUserUid, null)).rejects.toThrow('Permission denied');
    });
});
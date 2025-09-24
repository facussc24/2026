// Mock firebase-functions FIRST
jest.mock('firebase-functions', () => {
    // require() must be inside the mock factory to avoid ReferenceError
    const { HttpsError } = require('firebase-functions/v1/https');

    const firestore = {
        document: (path) => ({
            onCreate: jest.fn(),
            onWrite: jest.fn(),
        }),
    };
    const https = {
        onCall: (handler) => handler,
        onRequest: (handler) => handler,
        HttpsError: HttpsError,
    };
    const pubsub = {
        schedule: (schedule) => ({
            timeZone: (tz) => ({
                onRun: jest.fn(),
            }),
        }),
    };
    const runWith = (options) => ({
        https: https,
        firestore: firestore,
        pubsub: pubsub,
    });
    return {
        https: https,
        runWith: runWith,
        firestore: firestore,
        pubsub: pubsub,
        config: () => ({}),
    };
});

const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
// Initialize admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const axios = require('axios');
const { HttpsError } = require('firebase-functions/v1/https');

// Mock axios
jest.mock('axios');

// Import the function to be tested AFTER mocking
const { getTaskSummaryWithAI, organizeTaskWithAI } = require('../index');

describe('organizeTaskWithAI', () => {
    beforeEach(() => {
        axios.post.mockClear();
        process.env.GEMINI_API_KEY = 'test-api-key';
    });

    const context = { auth: { uid: 'test-uid' } };

    test('should throw unauthenticated error if user is not logged in', async () => {
        await expect(organizeTaskWithAI({ text: 'Some task' }, {})).rejects.toThrow(
            new HttpsError('unauthenticated', 'The function must be called while authenticated.')
        );
    });

    test('should throw invalid-argument error for missing text', async () => {
        await expect(organizeTaskWithAI({ text: '' }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The function must be called with a non-empty 'text' argument.")
        );
    });

    test('should return parsed JSON on successful API call', async () => {
        const mockResponse = {
            title: "Test Task",
            description: "A task for testing",
            subtasks: ["do stuff"],
            priority: "medium",
            dueDate: "2025-01-01"
        };
        const responseText = `\`\`\`json\n${JSON.stringify(mockResponse, null, 2)}\n\`\`\``;

        axios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: responseText }] } }] }
        });

        const result = await organizeTaskWithAI({ text: 'A valid task description' }, context);

        expect(result).toEqual(mockResponse);
        expect(axios.post).toHaveBeenCalledTimes(1);
        const prompt = axios.post.mock.calls[0][1].contents[0].parts[0].text;
        expect(prompt).toContain('A valid task description');
    });

    test('should throw internal error if Gemini API request fails', async () => {
        axios.post.mockRejectedValue({ response: { data: 'API Error' } });
        await expect(organizeTaskWithAI({ text: 'This will fail' }, context)).rejects.toThrow(
            new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
        );
    });

     test('should throw error if AI response is not valid JSON', async () => {
        const invalidResponseText = 'This is not JSON';
        axios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: invalidResponseText }] } }] }
        });

        await expect(organizeTaskWithAI({ text: 'A valid task description' }, context)).rejects.toThrow(
            new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
        );
    });
});

describe('getTaskSummaryWithAI', () => {
    beforeEach(() => {
        axios.post.mockClear();
        process.env.GEMINI_API_KEY = 'test-api-key';
    });

    const mockTasks = [
        { title: 'Task 1', status: 'done', priority: 'high', dueDate: '2024-01-01', description: 'desc 1' },
        { title: 'Task 2', status: 'inprogress', priority: 'medium', dueDate: '2025-12-31', description: 'desc 2' },
    ];
    const context = { auth: { uid: 'test-uid' } };

    test('should throw unauthenticated error if user is not logged in', async () => {
        await expect(getTaskSummaryWithAI({ tasks: mockTasks, question: 'summary' }, {})).rejects.toThrow(
            new HttpsError('unauthenticated', 'The function must be called while authenticated.')
        );
    });

    test('should throw invalid-argument error for missing tasks', async () => {
        await expect(getTaskSummaryWithAI({ question: 'summary' }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The function must be called with 'tasks' (array) and 'question' (string) arguments.")
        );
    });

    test('should throw invalid-argument error for missing question', async () => {
        await expect(getTaskSummaryWithAI({ tasks: mockTasks }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The function must be called with 'tasks' (array) and 'question' (string) arguments.")
        );
    });

    test('should throw invalid-argument error for invalid question key', async () => {
        await expect(getTaskSummaryWithAI({ tasks: mockTasks, question: 'invalid_question' }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The 'question' provided is not a valid one.")
        );
    });

    test('should return a summary on successful API call', async () => {
        const mockSummary = 'This is a test summary.';
        axios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: mockSummary }] } }] }
        });

        const result = await getTaskSummaryWithAI({ tasks: mockTasks, question: 'summary' }, context);

        expect(result).toEqual({ summary: mockSummary });
        expect(axios.post).toHaveBeenCalledTimes(1);
        const prompt = axios.post.mock.calls[0][1].contents[0].parts[0].text;
        expect(prompt).toContain('Genera un resumen conciso del estado general de las tareas.');
        expect(prompt).toContain(JSON.stringify(mockTasks.map(t => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          description: t.description ? t.description.substring(0, 100) : undefined
      })), null, 2));
    });

    test('should throw internal error if Gemini API request fails', async () => {
        axios.post.mockRejectedValue({ response: { data: 'API Error' } });
        await expect(getTaskSummaryWithAI({ tasks: mockTasks, question: 'summary' }, context)).rejects.toThrow(
            new HttpsError('internal', 'Ocurrió un error al generar el resumen con la IA.')
        );
    });
});

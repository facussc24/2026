const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
// Initialize admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const firebaseTest = require('firebase-functions-test')();
const axios = require('axios');
const { HttpsError } = require('firebase-functions/v1/https');

// Mock axios
jest.mock('axios');

// Import the function to be tested AFTER mocking
const { getTaskSummaryWithAI } = require('../index');

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
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        await expect(wrapped({ tasks: mockTasks, question: 'summary' }, {})).rejects.toThrow(
            new HttpsError('unauthenticated', 'The function must be called while authenticated.')
        );
    });

    test('should throw invalid-argument error for missing tasks', async () => {
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        await expect(wrapped({ question: 'summary' }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The function must be called with 'tasks' (array) and 'question' (string) arguments.")
        );
    });

    test('should throw invalid-argument error for missing question', async () => {
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        await expect(wrapped({ tasks: mockTasks }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The function must be called with 'tasks' (array) and 'question' (string) arguments.")
        );
    });

    test('should throw invalid-argument error for invalid question key', async () => {
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        await expect(wrapped({ tasks: mockTasks, question: 'invalid_question' }, context)).rejects.toThrow(
            new HttpsError('invalid-argument', "The 'question' provided is not a valid one.")
        );
    });

    test('should return a summary on successful API call', async () => {
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        const mockSummary = 'This is a test summary.';
        axios.post.mockResolvedValue({
            data: { candidates: [{ content: { parts: [{ text: mockSummary }] } }] }
        });

        const result = await wrapped({ tasks: mockTasks, question: 'summary' }, context);

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
        const wrapped = firebaseTest.wrap(getTaskSummaryWithAI);
        axios.post.mockRejectedValue({ response: { data: 'API Error' } });
        await expect(wrapped({ tasks: mockTasks, question: 'summary' }, context)).rejects.toThrow(
            new HttpsError('internal', 'Ocurrió un error al generar el resumen con la IA.')
        );
    });
});

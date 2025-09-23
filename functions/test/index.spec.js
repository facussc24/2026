const { describe, beforeEach, test, expect } = require('@jest/globals');
const firebaseTest = require('firebase-functions-test')();
const axios = require('axios');
const { HttpsError } = require('firebase-functions/v1/https');

// Mock axios
jest.mock('axios');

// Import the function to be tested AFTER mocking
const { organizeTaskWithAI } = require('../index');

describe('organizeTaskWithAI (axios version)', () => {
  beforeEach(() => {
    axios.post.mockClear();
    process.env.GEMINI_API_KEY = 'test-api-key'; // Set a dummy key for tests
  });

  // Test case for unauthenticated user
  test('should throw unauthenticated error if user is not logged in', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = {}; // No auth context
    const data = { text: 'Some task' };

    await expect(wrapped(data, context)).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });

  // Test case for invalid input
  test('should throw invalid-argument error for empty text', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: '' }; // Empty text

    await expect(wrapped(data, context)).rejects.toThrow(
      new HttpsError('invalid-argument', "The function must be called with a non-empty 'text' argument.")
    );
  });

  // Test case for successful API call
  test('should return organized task data on successful API call', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'Prepare presentation for the new client' };

    const mockApiResponse = {
      title: 'Prepare Client Presentation',
      description: 'A presentation for the new client.',
      subtasks: ['Research client data', 'Create PowerPoint', 'Coordinate with sales'],
    };

    // Mock the axios.post response
    axios.post.mockResolvedValue({
      data: {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify(mockApiResponse)
            }]
          }
        }]
      }
    });

    const result = await wrapped(data, context);

    expect(result).toEqual(mockApiResponse);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=test-api-key'),
        expect.any(Object)
    );
  });

  // Test case for Gemini API error (e.g., 400 or 500 from their end)
  test('should throw internal error if Gemini API request fails', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task that will fail' };

    axios.post.mockRejectedValue({ response: { data: 'API Error' } });

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  // Test case for malformed JSON response from AI
  test('should throw internal error if AI response is not valid JSON', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task with bad response' };

    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }] }
    });

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  // Test case for response with missing fields
  test('should throw internal error if AI response is missing required fields', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task with incomplete response' };

    const incompleteResponse = { title: 'Only a title', subtasks: [] }; // Missing 'description'

    axios.post.mockResolvedValue({
        data: { candidates: [{ content: { parts: [{ text: JSON.stringify(incompleteResponse) }] } }] }
    });

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });
});

const { describe, beforeEach, test, expect } = require('@jest/globals');
const firebaseTest = require('firebase-functions-test')();
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v1/https');

// Mock the @google/genai library
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Import the function to be tested AFTER mocking
const { organizeTaskWithAI } = require('../index');

describe('organizeTaskWithAI', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockGenerateContent.mockClear();
    jest.clearAllMocks();
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
      subtasks: ['Research client data', 'Create PowerPoint', 'Coordinate with sales'],
    };

    // Mock the API response
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockApiResponse),
      },
    });

    const result = await wrapped(data, context);

    expect(result).toEqual(mockApiResponse);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // Test case for successful API call with markdown in response
  test('should correctly parse JSON even with markdown backticks', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'Another task' };

    const mockApiResponse = {
      title: 'Another Task Title',
      subtasks: ['Subtask 1', 'Subtask 2'],
    };

    const rawApiResponse = "```json\n" + JSON.stringify(mockApiResponse) + "\n```";

    mockGenerateContent.mockResolvedValue({
        response: { text: () => rawApiResponse },
    });

    const result = await wrapped(data, context);
    expect(result).toEqual(mockApiResponse);
  });

  // Test case for Gemini API error
  test('should throw internal error if Gemini API fails', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task that will fail' };

    const errorMessage = 'Gemini API is down';
    mockGenerateContent.mockRejectedValue(new Error(errorMessage));

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  // Test case for malformed JSON response
  test('should throw internal error if API response is not valid JSON', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task with bad response' };

    mockGenerateContent.mockResolvedValue({
        response: { text: () => 'This is not JSON' },
    });

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  // Test case for response with missing fields
  test('should throw internal error if API response is missing required fields', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const data = { text: 'A task with incomplete response' };

    const incompleteResponse = { title: 'Only a title' }; // Missing 'subtasks'

    mockGenerateContent.mockResolvedValue({
        response: { text: () => JSON.stringify(incompleteResponse) },
    });

    await expect(wrapped(data, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });
});

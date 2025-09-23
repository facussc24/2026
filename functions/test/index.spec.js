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

// Import the functions to be tested AFTER mocking
const { organizeTaskWithAI, getNextEcrNumber } = require('../index');

describe('organizeTaskWithAI (axios version)', () => {
  beforeEach(() => {
    axios.post.mockClear();
    process.env.GEMINI_API_KEY = 'test-api-key'; // Set a dummy key for tests
  });

  test('should throw unauthenticated error if user is not logged in', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    await expect(wrapped({ text: 'Some task' }, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });

  test('should throw invalid-argument error for empty text', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    await expect(wrapped({ text: '' }, context)).rejects.toThrow(
      new HttpsError('invalid-argument', "The function must be called with a non-empty 'text' argument.")
    );
  });

  test('should return all fields on successful API call', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const mockApiResponse = {
      title: 'Prepare Client Presentation',
      description: 'A presentation for the new client.',
      subtasks: ['Research client data', 'Create PowerPoint'],
      priority: 'high',
      dueDate: '2024-10-25',
      assignee: 'Maria Garcia',
      isPublic: true,
      project: 'Project Titan',
    };
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify(mockApiResponse) }] } }] }
    });

    const result = await wrapped({ text: 'Urgent: Prepare presentation for Maria Garcia for Project Titan by Oct 25 2024' }, context);

    expect(result).toEqual(mockApiResponse);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('should handle partial AI response gracefully', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    const mockApiResponse = {
      title: 'Follow up on invoice',
      description: 'Need to follow up on the invoice sent last week.',
      subtasks: [],
      priority: 'low',
      dueDate: null,
      assignee: null,
      isPublic: false,
      project: null,
    };
     axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify(mockApiResponse) }] } }] }
    });

    const result = await wrapped({ text: 'Follow up on invoice' }, context);

    expect(result.title).toBe('Follow up on invoice');
    expect(result.priority).toBe('low');
    expect(result.dueDate).toBeNull();
    expect(result.assignee).toBeNull();
  });


  test('should throw internal error if Gemini API request fails', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    axios.post.mockRejectedValue({ response: { data: 'API Error' } });
    await expect(wrapped({ text: 'A task that will fail' }, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  test('should throw internal error if AI response is not valid JSON', async () => {
    const wrapped = firebaseTest.wrap(organizeTaskWithAI);
    const context = { auth: { uid: 'test-uid' } };
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }] }
    });
    await expect(wrapped({ text: 'A task with bad response' }, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });
});

describe('getNextEcrNumber', () => {
  let mockGet;
  let mockSet;
  let mockTransaction;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockTransaction = {
      get: mockGet,
      set: mockSet,
    };

    // Mock the runTransaction call
    admin.firestore = () => ({
      runTransaction: (updateFunction) => updateFunction(mockTransaction),
      collection: () => ({
        doc: () => ({})
      })
    });
  });

  test('should start at 1 for a new year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear - 1, count: 123 }) });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith({}, { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should increment the counter for the current year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear, count: 5 }) });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith({}, { count: 6, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-006`);
  });

  test('should start at 1 if counter document does not exist', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: false });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith({}, { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should throw unauthenticated error if no auth context', async () => {
    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    await expect(wrapped({}, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });
});

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

// Mock other dependencies
jest.mock('axios');
jest.mock('firebase-admin', () => ({
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn(),
    auth: () => ({
        getUser: jest.fn().mockResolvedValue({ email: 'test@test.com', displayName: 'Test User' })
    })
}));

const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
const axios = require('axios');
const { HttpsError } = require('firebase-functions/v1/https');

// Import the functions to be tested AFTER mocking
const { organizeTaskWithAI, getNextEcrNumber } = require('../index');

describe('organizeTaskWithAI (axios version)', () => {
  beforeEach(() => {
    axios.post.mockClear();
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  test('should throw unauthenticated error if user is not logged in', async () => {
    await expect(organizeTaskWithAI({ text: 'Some task' }, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });

  test('should throw invalid-argument error for empty text', async () => {
    const context = { auth: { uid: 'test-uid' } };
    await expect(organizeTaskWithAI({ text: '' }, context)).rejects.toThrow(
      new HttpsError('invalid-argument', "The function must be called with a non-empty 'text' argument.")
    );
  });

  test('should return all fields on successful API call', async () => {
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

    const result = await organizeTaskWithAI({ text: 'Urgent: Prepare presentation for Maria Garcia for Project Titan by Oct 25 2024' }, context);

    expect(result).toEqual(mockApiResponse);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('should handle partial AI response gracefully', async () => {
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

    const result = await organizeTaskWithAI({ text: 'Follow up on invoice' }, context);

    expect(result.title).toBe('Follow up on invoice');
    expect(result.priority).toBe('low');
    expect(result.dueDate).toBeNull();
    expect(result.assignee).toBeNull();
  });


  test('should throw internal error if Gemini API request fails', async () => {
    const context = { auth: { uid: 'test-uid' } };
    axios.post.mockRejectedValue({ response: { data: 'API Error' } });
    await expect(organizeTaskWithAI({ text: 'A task that will fail' }, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });

  test('should throw internal error if AI response is not valid JSON', async () => {
    const context = { auth: { uid: 'test-uid' } };
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }] }
    });
    await expect(organizeTaskWithAI({ text: 'A task with bad response' }, context)).rejects.toThrow(
        new HttpsError('internal', 'Ocurrió un error al procesar la solicitud con la IA.')
    );
  });
});

describe('getNextEcrNumber', () => {
  let mockGet;
  let mockSet;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn();

    admin.firestore.mockReturnValue({
      runTransaction: (updateFunction) => {
        const mockTransaction = {
          get: mockGet,
          set: mockSet,
        };
        return updateFunction(mockTransaction);
      },
      collection: () => ({
        doc: () => ({}),
      }),
    });
  });

  test('should start at 1 for a new year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear - 1, count: 123 }) });

    const result = await getNextEcrNumber({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should increment the counter for the current year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear, count: 5 }) });

    const result = await getNextEcrNumber({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 6, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-006`);
  });

  test('should start at 1 if counter document does not exist', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: false });

    const result = await getNextEcrNumber({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should throw unauthenticated error if no auth context', async () => {
    await expect(getNextEcrNumber({}, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });
});

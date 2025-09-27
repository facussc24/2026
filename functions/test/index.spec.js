// --- MOCKING STRATEGY ---
// Mock the entire @google-cloud/vertexai library.
const mockGenerateContent = jest.fn();
jest.mock('@google-cloud/vertexai', () => ({
    VertexAI: jest.fn(() => ({
        getGenerativeModel: jest.fn(() => ({
            generateContent: mockGenerateContent,
        })),
    })),
}));

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn(),
    auth: () => ({
        getUser: jest.fn().mockResolvedValue({ email: 'test@test.com', displayName: 'Test User' })
    })
}));
// --- END MOCKING ---

const { describe, beforeEach, test, expect } = require('@jest/globals');
const admin = require('firebase-admin');
const firebaseTest = require('firebase-functions-test')();
const { HttpsError } = require('firebase-functions/v1/https');

// Import the functions to be tested AFTER mocking
const { organizeTaskWithAI, getNextEcrNumber } = require('../index');

describe('organizeTaskWithAI (Vertex AI version)', () => {
    beforeEach(() => {
        // Clear mock history before each test
        mockGenerateContent.mockClear();
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

    test('should return parsed task data on successful API call', async () => {
        const wrapped = firebaseTest.wrap(organizeTaskWithAI);
        const context = { auth: { uid: 'test-uid' } };
        const mockApiResponse = {
            tasks: [{
                title: 'Prepare Client Presentation',
                description: 'A presentation for the new client.',
                tags: ['presentation', 'client'],
            }]
        };

        // Simulate a valid Vertex AI response
        mockGenerateContent.mockResolvedValue({
            response: {
                candidates: [{
                    content: { parts: [{ text: JSON.stringify(mockApiResponse) }] }
                }]
            }
        });

        const result = await wrapped({ text: 'Prepare presentation for client' }, context);

        expect(result).toEqual(mockApiResponse);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    test('should throw internal error if AI response is not valid JSON', async () => {
        const wrapped = firebaseTest.wrap(organizeTaskWithAI);
        const context = { auth: { uid: 'test-uid' } };
        mockGenerateContent.mockResolvedValue({
            response: {
                candidates: [{
                    content: { parts: [{ text: 'This is not JSON' }] }
                }]
            }
        });

        await expect(wrapped({ text: 'A task with bad response' }, context)).rejects.toThrow(
            'No se encontró un bloque JSON válido en la respuesta de la IA.'
        );
    });

    test('should throw internal error if Vertex AI request fails', async () => {
        const wrapped = firebaseTest.wrap(organizeTaskWithAI);
        const context = { auth: { uid: 'test-uid' } };
        const apiError = new Error('API Error');
        mockGenerateContent.mockRejectedValue(apiError);

        await expect(wrapped({ text: 'A task that will fail' }, context)).rejects.toThrow(
            expect.objectContaining({
                message: expect.stringContaining('Vertex AI Full Error')
            })
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

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should increment the counter for the current year', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: true, data: () => ({ year: currentYear, count: 5 }) });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 6, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-006`);
  });

  test('should start at 1 if counter document does not exist', async () => {
    const currentYear = new Date().getFullYear();
    mockGet.mockResolvedValue({ exists: false });

    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    const result = await wrapped({}, { auth: { uid: 'test-uid' }});

    expect(mockSet).toHaveBeenCalledWith(expect.anything(), { count: 1, year: currentYear }, { merge: true });
    expect(result.ecrNumber).toBe(`ECR-${currentYear}-001`);
  });

  test('should throw unauthenticated error if no auth context', async () => {
    const wrapped = firebaseTest.wrap(getNextEcrNumber);
    await expect(wrapped({}, {})).rejects.toThrow(
      new HttpsError('unauthenticated', 'The function must be called while authenticated.')
    );
  });
});
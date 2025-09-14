import { jest } from '@jest/globals';

// Mocking the Firebase Storage module for Jest tests
// This prevents Jest from trying to import from a URL, which it cannot do.

export const getStorage = jest.fn(() => {
  // Returns a mock storage instance.
  // We don't need any complex implementation for the current tests.
  return {};
});

export const ref = jest.fn((storage, path) => {
  // Returns a mock reference. The path is useful for debugging.
  return {
    path: path,
    toString: () => `gs://mock-bucket/${path}`,
  };
});

export const listAll = jest.fn(async (ref) => {
  // Returns a mock response for listAll, simulating an empty folder.
  // Tests that depend on a list of models can spy on this and provide their own mock implementation.
  return Promise.resolve({
    items: [],
    prefixes: [],
  });
});

export const getDownloadURL = jest.fn(async (ref) => {
  // Returns a fake, static URL for any model request.
  return Promise.resolve('https://firebasestorage.googleapis.com/v0/b/mock.appspot.com/o/test-model.glb?alt=media');
});

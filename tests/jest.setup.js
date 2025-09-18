// Polyfill for TextEncoder and TextDecoder, which are not available in the jsdom environment
import { TextEncoder, TextDecoder } from 'util';
import { createIcons } from '../__mocks__/lucide.js';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock the global 'lucide' object that is expected to be available
// The actual application loads this from a script tag, but tests need it explicitly.
global.lucide = {
  createIcons: createIcons,
};

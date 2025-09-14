import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock the global `lucide` object which is expected by some UI components
global.lucide = {
    createIcons: () => {}, // Use a simple empty function for the mock
};

// You can add other global setup here if needed in the future.

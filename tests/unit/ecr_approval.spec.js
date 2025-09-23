import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the function to be tested directly from its new, isolated location.
import { registerEcrApproval } from '../../public/modules/ecr/ecr-logic.js';
// We still need the real COLLECTIONS object.
import { COLLECTIONS } from '../../public/utils.js';

// --- Mocks Setup ---
// We only need to mock the dependencies that are passed into the function.

const mockShowToast = jest.fn();
const mockSendNotification = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockRunTransaction = jest.fn();

// This object simulates the `firestore` dependency that will be passed in.
const mockFirestore = {
    doc: jest.fn((db, collection, id) => ({ db, collection, id, path: `${collection}/${id}` })),
    getDoc: mockGetDoc,
    runTransaction: mockRunTransaction,
};

// This object simulates the `uiCallbacks` dependency.
const mockUiCallbacks = {
    showToast: mockShowToast,
    sendNotification: mockSendNotification,
};

// A mock for the global appState.
const mockAppState = {
    currentUser: {
        name: 'Test User',
        email: 'test@barack.com',
        sector: 'calidad',
        role: 'admin',
    },
};

// --- Test Suite ---

describe('registerEcrApproval State Machine', () => {
    beforeEach(() => {
        // Clear all mock function call histories before each test
        jest.clearAllMocks();

        // Provide a fresh implementation for the transaction mock for each test
        mockRunTransaction.mockImplementation(async (db, updateFunction) => {
            // This object simulates the `transaction` object that Firestore provides.
            const transaction = {
                get: mockGetDoc, // It has a `get` method
                update: mockUpdateDoc, // and an `update` method
            };
            // The `updateFunction` is the code we are testing. We call it with our mock transaction.
            await updateFunction(transaction);
        });
    });

    test('should transition ECR status to "approved" when the last required department approves', async () => {
        // --- 1. ARRANGE ---
        const ecrId = 'ECR-BUG-001';
        const initialEcrData = {
            id: ecrId,
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            afecta_logistica: false,
            approvals: {
                calidad: { status: 'approved', user: 'Calidad User', date: '2023-01-01', comment: 'OK' }
            }
        };

        // Configure the mock for `transaction.get()` to return our test data.
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => JSON.parse(JSON.stringify(initialEcrData)) });

        // Set the current user to be the one from the 'compras' department for this test run.
        mockAppState.currentUser.sector = 'compras';

        const deps = {
            db: 'mockDb',
            firestore: mockFirestore,
            COLLECTIONS,
            appState: mockAppState,
            uiCallbacks: mockUiCallbacks,
        };

        // --- 2. ACT ---
        // The user from 'compras' submits the final required approval.
        await registerEcrApproval(ecrId, 'compras', 'approved', 'Final approval.', deps);

        // --- 3. ASSERT ---
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updateCallArgs = mockUpdateDoc.mock.calls[0][1];

        expect(updateCallArgs['approvals.compras'].status).toBe('approved');

        // The overall status should now be 'approved' as all required departments have approved.
        expect(updateCallArgs.status).toBe('approved');
    });

    test('should transition ECR status to "rejected" when any required department rejects', async () => {
        // --- ARRANGE ---
        const ecrId = 'ECR-REJECT-001';
        const initialEcrData = {
            id: ecrId,
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {
                 calidad: { status: 'approved', user: 'Calidad User', date: '2023-01-01', comment: 'OK' }
            }
        };
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => JSON.parse(JSON.stringify(initialEcrData)) });
        mockAppState.currentUser.sector = 'compras';
        const deps = { db: 'mockDb', firestore: mockFirestore, COLLECTIONS, appState: mockAppState, uiCallbacks: mockUiCallbacks };

        // --- ACT ---
        await registerEcrApproval(ecrId, 'compras', 'rejected', 'Not viable.', deps);

        // --- ASSERT ---
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updateCallArgs = mockUpdateDoc.mock.calls[0][1];
        expect(updateCallArgs['approvals.compras'].status).toBe('rejected');
        expect(updateCallArgs.status).toBe('rejected');
    });

    test('should remain "pending-approval" when a required department approves but others are still pending', async () => {
        // --- ARRANGE ---
        const ecrId = 'ECR-PENDING-001';
        const initialEcrData = {
            id: ecrId,
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {} // No approvals yet
        };
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => JSON.parse(JSON.stringify(initialEcrData)) });
        mockAppState.currentUser.sector = 'calidad';
        const deps = { db: 'mockDb', firestore: mockFirestore, COLLECTIONS, appState: mockAppState, uiCallbacks: mockUiCallbacks };

        // --- ACT ---
        await registerEcrApproval(ecrId, 'calidad', 'approved', 'First approval.', deps);

        // --- ASSERT ---
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updateCallArgs = mockUpdateDoc.mock.calls[0][1];
        expect(updateCallArgs['approvals.calidad'].status).toBe('approved');
        // The overall status should NOT be in the update call, meaning it remains unchanged.
        expect(updateCallArgs.status).toBeUndefined();
    });
});

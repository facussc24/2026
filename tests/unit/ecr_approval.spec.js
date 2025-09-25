import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// 1. Import the function to test AND the functions to mock
import { registerEcrApproval } from '../../public/modules/ecr/js/ecr-form-controller.js';
import { runTransaction, doc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { db, sendNotification } from '../../public/main.js';

// 2. Mock the modules by path. Jest will replace the imported functions with mocks.
jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js', () => ({
  runTransaction: jest.fn(),
  doc: jest.fn(),
}));
jest.mock('../../public/main.js', () => ({
  db: {}, // Mock db object
  sendNotification: jest.fn(),
}));


// 3. Begin the test suite
describe('registerEcrApproval State Machine', () => {
    let mockAppState;
    const mockGetDoc = jest.fn();
    const mockUpdateDoc = jest.fn();

    beforeEach(() => {
        // Clear all mock history before each test
        runTransaction.mockClear();
        doc.mockClear();
        sendNotification.mockClear();
        mockGetDoc.mockClear();
        mockUpdateDoc.mockClear();

        // Configure the mock implementation for runTransaction for each test
        runTransaction.mockImplementation(async (database, updateFunction) => {
            const transaction = {
                get: mockGetDoc,
                update: mockUpdateDoc,
            };
            // Execute the function that was passed to the transaction
            await updateFunction(transaction);
        });

        // Set up a default mock for appState
        mockAppState = {
            currentUser: {
                name: 'Test User',
                email: 'test@barack.com',
            },
        };
    });

    test('should transition ECR status to "approved" when the last required department approves', async () => {
        // ARRANGE
        const ecrId = 'ECR-APPROVE-001';
        const initialEcrData = {
            ecr_no: ecrId,
            creatorUid: 'user123',
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {
                calidad: { status: 'approved', user: 'Calidad User' }
            }
        };
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => initialEcrData });

        // ACT
        await registerEcrApproval(ecrId, 'compras', 'approved', 'Final approval.', { appState: mockAppState });

        // ASSERT
        expect(runTransaction).toHaveBeenCalledTimes(1);
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updatePayload = mockUpdateDoc.mock.calls[0][1];
        expect(updatePayload['approvals.compras'].status).toBe('approved');
        expect(updatePayload.status).toBe('approved');
        expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    test('should transition ECR status to "rejected" when any required department rejects', async () => {
        // ARRANGE
        const ecrId = 'ECR-REJECT-001';
        const initialEcrData = {
            ecr_no: ecrId,
            creatorUid: 'user123',
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {
                 calidad: { status: 'approved', user: 'Calidad User' }
            }
        };
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => initialEcrData });

        // ACT
        await registerEcrApproval(ecrId, 'compras', 'rejected', 'Not viable.', { appState: mockAppState });

        // ASSERT
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updatePayload = mockUpdateDoc.mock.calls[0][1];
        expect(updatePayload['approvals.compras'].status).toBe('rejected');
        expect(updatePayload.status).toBe('rejected');
        expect(sendNotification).toHaveBeenCalledTimes(1);
    });

    test('should remain "pending-approval" when a required department approves but others are still pending', async () => {
        // ARRANGE
        const ecrId = 'ECR-PENDING-001';
        const initialEcrData = {
            ecr_no: ecrId,
            creatorUid: 'user123',
            status: 'pending-approval',
            afecta_calidad: true,
            afecta_compras: true,
            approvals: {}
        };
        mockGetDoc.mockResolvedValue({ exists: () => true, data: () => initialEcrData });

        // ACT
        await registerEcrApproval(ecrId, 'calidad', 'approved', 'First approval.', { appState: mockAppState });

        // ASSERT
        expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
        const updatePayload = mockUpdateDoc.mock.calls[0][1];
        expect(updatePayload['approvals.calidad'].status).toBe('approved');
        expect(updatePayload.status).toBeUndefined(); // Status should not be in the payload
        expect(sendNotification).not.toHaveBeenCalled(); // No notification for pending changes
    });
});
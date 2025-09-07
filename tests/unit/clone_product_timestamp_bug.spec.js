import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { cloneProduct, appState } from '../../public/main.js';

describe('cloneProduct Timestamp and Metadata Handling', () => {

    let mockFirestore;
    let mockUi;
    let mockDb;
    let mockDependencies;

    beforeEach(() => {
        // Create fresh mocks for each test
        mockFirestore = {
            getDocs: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
            query: jest.fn(),
            collection: jest.fn(),
            where: jest.fn(),
            addDoc: jest.fn().mockResolvedValue({}),
        };

        mockUi = {
            showToast: jest.fn(),
            showPromptModal: jest.fn().mockResolvedValue('PROD-CLON'),
        };

        mockDb = {}; // A dummy object for the db dependency

        mockDependencies = {
            db: mockDb,
            firestore: mockFirestore,
            ui: mockUi,
            appState: appState, // Use the real appState to set the product to clone
        };

        // Reset appState for isolation
        appState.sinopticoTabularState = {
            selectedProduct: null,
        };
    });

    test('should correctly handle date fields and metadata when cloning', async () => {
        // --- ARRANGE ---
        const originalCreationDate = new Date('2023-01-01T12:00:00Z');
        const originalModDate = new Date('2023-10-26T10:00:00Z');

        const productToClone = {
            id: 'PROD-ORIGINAL',
            descripcion: 'Producto Original',
            createdAt: originalCreationDate,
            fecha_modificacion: originalModDate,
            docId: 'xyz-123',
            reviewedBy: 'Old User',
            estructura: [],
        };

        appState.sinopticoTabularState.selectedProduct = productToClone;

        // --- ACT ---
        await cloneProduct(mockDependencies);

        // --- ASSERT ---
        // Verify that the UI and DB checks were performed
        expect(mockUi.showPromptModal).toHaveBeenCalled();
        expect(mockFirestore.getDocs).toHaveBeenCalled();
        expect(mockFirestore.addDoc).toHaveBeenCalledTimes(1);

        // Get the object that was passed to addDoc for saving
        const savedProduct = mockFirestore.addDoc.mock.calls[0][1];

        // 1. Check that original metadata was removed
        expect(savedProduct.docId).toBeUndefined();
        expect(savedProduct.reviewedBy).toBeUndefined();

        // 2. Check that the ID is the new one
        expect(savedProduct.id).toBe('PROD-CLON');

        // 3. Check that the new date fields are Date objects
        expect(savedProduct.createdAt).toBeInstanceOf(Date);
        expect(savedProduct.fecha_modificacion).toBeInstanceOf(Date);

        // 4. Check that the new dates are recent, not the old ones
        expect(savedProduct.createdAt.getTime()).not.toBe(originalCreationDate.getTime());
        expect(savedProduct.fecha_modificacion.getTime()).not.toBe(originalModDate.getTime());
        expect(savedProduct.createdAt.getTime()).toBeGreaterThan(Date.now() - 5000); // Check if it's recent
    });
});

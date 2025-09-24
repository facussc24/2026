import { jest, describe, test, expect, beforeEach } from '@jest/globals';
// The function to test
import { cloneProduct } from '../../public/modules/products/product-logic.js';

const appState = {
    sinopticoTabularState: {
        selectedProduct: null,
    },
};

describe('cloneProduct Part Code (codigo_pieza) Bug', () => {

    let mockFirestore;
    let mockUi;
    let mockDb;
    let mockDependencies;

    beforeEach(() => {
        // Reset mocks for each test to ensure isolation
        mockFirestore = {
            getDocs: jest.fn().mockResolvedValue({ empty: true }), // Assume new ID is unique
            query: jest.fn(),
            collection: jest.fn(),
            where: jest.fn(),
            addDoc: jest.fn().mockResolvedValue({}),
        };

        mockUi = {
            showToast: jest.fn(),
            // Mock the prompt to resolve with the new product ID
            showPromptModal: jest.fn().mockResolvedValue('PROD-CLON'),
        };

        mockDb = {}; // A dummy object for the db dependency

        mockDependencies = {
            db: mockDb,
            firestore: mockFirestore,
            ui: mockUi,
            appState: appState,
        };

        // Reset appState before each test
        appState.sinopticoTabularState = {
            selectedProduct: null,
        };
    });

    test('should update codigo_pieza to the new ID when cloning', async () => {
        // --- ARRANGE ---
        // Define the original product that will be cloned
        const originalProduct = {
            id: 'PROD-ORIGINAL',
            descripcion: 'Producto Original',
            // This is the key field for the bug
            codigo_pieza: 'PROD-ORIGINAL',
            // Other fields to make the object realistic
            createdAt: new Date('2023-01-01T12:00:00Z'),
            fecha_modificacion: new Date('2023-10-26T10:00:00Z'),
            estructura: [],
        };

        // Set the product to be cloned in the mocked appState
        appState.sinopticoTabularState.selectedProduct = originalProduct;

        // --- ACT ---
        // Call the function we are testing
        await cloneProduct(mockDependencies);

        // --- ASSERT ---
        // 1. Verify that the function tried to save a document
        expect(mockFirestore.addDoc).toHaveBeenCalledTimes(1);

        // 2. Get the product object that was passed to the database
        const savedProduct = mockFirestore.addDoc.mock.calls[0][1];

        // 3. **This is the critical assertion for the bug fix.**
        //    Check that 'codigo_pieza' is the new ID, not the original one.
        expect(savedProduct.codigo_pieza).toBe('PROD-CLON');

        // 4. Also verify that the main 'id' field is correct, as a sanity check.
        expect(savedProduct.id).toBe('PROD-CLON');
    });
});

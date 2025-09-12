import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { cloneProduct, appState } from '../../public/main.js';

describe('cloneProduct Additional Metadata Bug', () => {

    let mockFirestore;
    let mockUi;
    let mockDependencies;

    beforeEach(() => {
        mockFirestore = {
            getDocs: jest.fn().mockResolvedValue({ empty: true }),
            query: jest.fn(),
            collection: jest.fn(),
            where: jest.fn(),
            addDoc: jest.fn().mockResolvedValue({}),
        };

        mockUi = {
            showToast: jest.fn(),
            showPromptModal: jest.fn().mockResolvedValue('PROD-CLON-META'),
        };

        mockDependencies = {
            db: {},
            firestore: mockFirestore,
            ui: mockUi,
            appState: appState,
        };

        appState.sinopticoTabularState = {
            selectedProduct: null,
        };
    });

    test('should clear review and approval metadata when cloning', async () => {
        // --- ARRANGE ---
        const originalProduct = {
            id: 'PROD-ORIGINAL-META',
            descripcion: 'Producto con Metadatos de Revisión',
            // These are the fields the bug fails to clear
            fechaRevision: '2023-11-15',
            aprobadoPor: 'J. Doe',
            // Add other standard fields for realism
            createdAt: new Date(),
            fecha_modificacion: new Date(),
            estructura: [],
        };

        appState.sinopticoTabularState.selectedProduct = originalProduct;

        // --- ACT ---
        await cloneProduct(mockDependencies);

        // --- ASSERT ---
        expect(mockFirestore.addDoc).toHaveBeenCalledTimes(1);
        const savedProduct = mockFirestore.addDoc.mock.calls[0][1];

        // **Critical Assertions for the bug**
        // These fields should not be carried over to the clone.
        expect(savedProduct.fechaRevision).toBeUndefined();
        expect(savedProduct.aprobadoPor).toBeUndefined();

        // Sanity check: ensure other fields are still correct
        expect(savedProduct.id).toBe('PROD-CLON-META');
        expect(savedProduct.descripcion).toBe('Producto con Metadatos de Revisión');
    });
});

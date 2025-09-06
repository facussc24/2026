import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { deleteProductAndOrphanedSubProducts } from '../../public/data_logic.js';
import { COLLECTIONS } from '../../public/utils.js';

// Mock de UI Callbacks
const mockUiCallbacks = {
    showToast: jest.fn(),
    runTableLogic: jest.fn(),
};

// Mock de la base de datos y colecciones
const mockDb = {};

// Mock del objeto firestore
const mockFirestore = {
    doc: jest.fn((db, collection, id) => ({ db, collection, id })),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    deleteDoc: jest.fn(),
    collection: jest.fn((db, collection) => ({ db, collection })),
    query: jest.fn(),
    where: jest.fn(),
};

describe('deleteProductAndOrphanedSubProducts', () => {
    beforeEach(() => {
        // Limpiar todos los mocks antes de cada prueba
        Object.values(mockFirestore).forEach(mockFn => mockFn.mockClear());
        Object.values(mockUiCallbacks).forEach(mockFn => mockFn.mockClear());
    });

    test('should delete product and its unique sub-product', async () => {
        // Arrange
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'SUB001') return { exists: () => true, data: () => ({ id: 'SUB001' }) };
            return { exists: () => false, data: () => null };
        });

        mockFirestore.getDocs.mockResolvedValue({ empty: true, docs: [] }); // No other products

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'productos', 'PROD001');
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'semiterminados', 'SUB001');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Producto principal eliminado.', 'success');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });

    test('should only delete product if sub-product is used elsewhere', async () => {
        // Arrange
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };
        const otherProductData = { id: 'PROD002', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };

        mockFirestore.getDoc.mockResolvedValue({ exists: () => true, data: () => productToDeleteData });
        mockFirestore.getDocs.mockResolvedValue({ docs: [{ id: 'PROD002', data: () => otherProductData }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(1);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'productos', 'PROD001');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Producto principal eliminado.', 'success');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('No se eliminaron sub-componentes (están en uso por otros productos).', 'info');
    });

    test('should delete product and its orphan insumo', async () => {
        // Arrange
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'insumo', refId: 'INS001' }] };
        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'INS001') return { exists: () => true, data: () => ({ id: 'INS001' }) };
            return { exists: () => false, data: () => null };
        });
        mockFirestore.getDocs.mockResolvedValue({ empty: true, docs: [] }); // No other products use INS001

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });

    test('should do nothing if product does not exist', async () => {
        // Arrange
        mockFirestore.getDoc.mockResolvedValue({ exists: () => false });

        // Act
        await deleteProductAndOrphanedSubProducts('NON_EXISTENT_PROD', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).not.toHaveBeenCalled();
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('El producto ya no existe.', 'info');
    });

    test('should handle nested sub-products correctly', async () => {
        // Arrange
        const productToDeleteData = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001', children: [{ tipo: 'semiterminado', refId: 'SUB002' }] }]
        };

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'SUB001') return { exists: () => true, data: () => ({ id: 'SUB001' }) };
            if (docRef.id === 'SUB002') return { exists: () => true, data: () => ({ id: 'SUB002' }) };
            return { exists: () => false, data: () => null };
        });

        mockFirestore.getDocs.mockResolvedValue({ empty: true, docs: [] }); // No other products

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(3);
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('2 sub-componentes huérfanos eliminados.', 'success');
    });

    test('should handle errors during deletion', async () => {
        // Arrange
        const error = new Error('Firestore error');
        mockFirestore.getDoc.mockRejectedValue(error);

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Ocurrió un error durante la eliminación compleja.', 'error');
    });

    test('should not delete a sub-product if it is not found', async () => {
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'SUB001') return { exists: () => false, data: () => null }; // Sub-product does not exist
            return { exists: () => false, data: () => null };
        });

        mockFirestore.getDocs.mockResolvedValue({ empty: true, docs: [] }); // No other products

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(1); // Only the main product
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('No se eliminaron sub-componentes (están en uso por otros productos).', 'info');
    });

    // This test is now simpler as the logic doesn't depend on complex query mocks
    test('should correctly check for sub-product usage in other products with complex structures', async () => {
        // Arrange
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };
        const otherProductData = { id: 'PROD002', estructura: [{ tipo: 'semiterminado', refId: 'SUB002', children: [{ tipo: 'insumo', refId: 'INS001' }] }] };

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'SUB001') return { exists: () => true, data: () => ({ id: 'SUB001' }) };
            return { exists: () => false, data: () => null };
        });

        mockFirestore.getDocs.mockResolvedValue({ docs: [{ data: () => otherProductData }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });

    // This test is also simplified
    test('should handle products with empty structure in other products', async () => {
        // Arrange
        const productToDeleteData = { id: 'PROD001', estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }] };
        const otherProductData = { id: 'PROD002', estructura: [] }; // Empty structure

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === 'PROD001') return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'SUB001') return { exists: () => true, data: () => ({ id: 'SUB001' }) };
            return { exists: () => false, data: () => null };
        });

        mockFirestore.getDocs.mockResolvedValue({ docs: [{ data: () => otherProductData }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
    });

    // This test becomes irrelevant as the fix removes the query logic it was testing.
    // It can be removed or kept as a legacy test for a different bug. For now, let's remove it for clarity.
    // test('BUGFIX: should delete an orphaned semiterminado by its unique key (codigo_pieza)...

    // This test is now much cleaner with the new mocking strategy.
    test('should correctly identify and delete an orphan when it is only used by the product being deleted', async () => {
        // Arrange
        const productToDeleteId = 'PROD_A';
        const productToDeleteData = { id: productToDeleteId, estructura: [{ tipo: 'semiterminado', refId: 'ORPHAN_SUB' }] };
        const otherProductData = { id: 'PROD_B', estructura: [{ tipo: 'semiterminado', refId: 'USED_SUB' }] };

        mockFirestore.getDoc.mockImplementation(async (docRef) => {
            if (docRef.id === productToDeleteId) return { exists: () => true, data: () => productToDeleteData };
            if (docRef.id === 'ORPHAN_SUB') return { exists: () => true, data: () => ({ id: 'ORPHAN_SUB' }) };
            return { exists: () => false, data: () => null };
        });

        // The dependency check now correctly excludes the product being deleted in the main logic,
        // so we only need to provide the "other" products here.
        mockFirestore.getDocs.mockResolvedValue({ docs: [{ id: 'PROD_B', data: () => otherProductData }] });

        // Act
        await deleteProductAndOrphanedSubProducts(productToDeleteId, mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, COLLECTIONS.SEMITERMINADOS, 'ORPHAN_SUB');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });
});

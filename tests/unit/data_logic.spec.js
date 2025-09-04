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
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };
        const subProductToDelete = { id: 'SUB001' };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs
            .mockResolvedValueOnce({ empty: true, docs: [] }) // get all other products (none)
            .mockResolvedValueOnce({ empty: false, docs: [{ id: 'SUB001_DOC_ID', data: () => subProductToDelete }] }); // find sub-product to delete

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'productos', 'PROD001');
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'semiterminados', 'SUB001_DOC_ID');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Producto principal eliminado.', 'success');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });

    test('should only delete product if sub-product is used elsewhere', async () => {
        // Arrange
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };
        const otherProduct = {
            id: 'PROD002',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs.mockResolvedValueOnce({ docs: [{ data: () => otherProduct }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(1);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'productos', 'PROD001');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Producto principal eliminado.', 'success');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('No se eliminaron sub-componentes (están en uso por otros productos).', 'info');
    });

    test('should only delete product if it has no sub-products', async () => {
        // Arrange
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'insumo', refId: 'INS001' }] // No semiterminados
        };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(1);
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, 'productos', 'PROD001');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('Producto principal eliminado.', 'success');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('El producto no tenía sub-componentes para verificar.', 'info');
    });

    test('should do nothing if product does not exist', async () => {
        // Arrange
        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => false });

        // Act
        await deleteProductAndOrphanedSubProducts('NON_EXISTENT_PROD', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).not.toHaveBeenCalled();
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('El producto ya no existe.', 'info');
    });

    test('should handle nested sub-products correctly', async () => {
        // Arrange
        const productToDelete = {
            id: 'PROD001',
            estructura: [
                {
                    tipo: 'semiterminado',
                    refId: 'SUB001',
                    children: [
                        { tipo: 'semiterminado', refId: 'SUB002' }
                    ]
                }
            ]
        };
        const subProduct1 = { id: 'SUB001' };
        const subProduct2 = { id: 'SUB002' };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs
            .mockResolvedValueOnce({ empty: true, docs: [] }) // no other products
            .mockResolvedValueOnce({ empty: false, docs: [{ id: 'SUB001_DOC_ID', data: () => subProduct1 }] })
            .mockResolvedValueOnce({ empty: false, docs: [{ id: 'SUB002_DOC_ID', data: () => subProduct2 }] });

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
        expect(mockUiCallbacks.runTableLogic).toHaveBeenCalled();
    });

    test('should not delete a sub-product if it is not found', async () => {
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs
            .mockResolvedValueOnce({ empty: true, docs: [] }) // no other products
            .mockResolvedValueOnce({ empty: true, docs: [] }); // sub-product not found

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(1); // Only the main product
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('No se eliminaron sub-componentes (están en uso por otros productos).', 'info');
    });

    test('should correctly check for sub-product usage in other products with complex structures', async () => {
        // Arrange
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };
        const otherProduct = {
            id: 'PROD002',
            estructura: [
                {
                    tipo: 'semiterminado',
                    refId: 'SUB002',
                    children: [
                        { tipo: 'insumo', refId: 'INS001' }
                    ]
                }
            ]
        };
        const subProductToDelete = { id: 'SUB001' };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs
            .mockResolvedValueOnce({ docs: [{ data: () => otherProduct }] })
            .mockResolvedValueOnce({ empty: false, docs: [{ id: 'SUB001_DOC_ID', data: () => subProductToDelete }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });

    test('should handle products with empty structure', async () => {
        // Arrange
        const productToDelete = {
            id: 'PROD001',
            estructura: [{ tipo: 'semiterminado', refId: 'SUB001' }]
        };
        const otherProduct = {
            id: 'PROD002',
            estructura: [] // Empty structure
        };
        const subProductToDelete = { id: 'SUB001' };

        mockFirestore.getDoc.mockResolvedValueOnce({ exists: () => true, data: () => productToDelete });
        mockFirestore.getDocs
            .mockResolvedValueOnce({ docs: [{ data: () => otherProduct }] })
            .mockResolvedValueOnce({ empty: false, docs: [{ id: 'SUB001_DOC_ID', data: () => subProductToDelete }] });

        // Act
        await deleteProductAndOrphanedSubProducts('PROD001', mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
    });

    test('BUGFIX: should delete an orphaned semiterminado by its unique key (codigo_pieza) even if it lacks an "id" field', async () => {
        // --- 1. SETUP ---

        // Mock the main product to be deleted
        const mainProduct = {
            docId: 'product-to-delete',
            estructura: [
                {
                    tipo: 'semiterminado',
                    refId: 'orphan-sub-123', // This is the 'codigo_pieza'
                    children: []
                }
            ]
        };
        mockFirestore.getDoc.mockResolvedValueOnce({
            exists: () => true,
            data: () => mainProduct
        });

        // Mock the query for all other products (return an empty list, so the sub-product is an orphan)
        mockFirestore.getDocs.mockResolvedValueOnce({
            docs: [],
            empty: true
        });

        // Mock the query for the orphaned semiterminado.
        // This is the key part of the test: the returned document has 'codigo_pieza' but NO 'id' field.
        const orphanedSubProductDoc = {
            id: 'doc-id-in-firestore', // The actual document ID in Firestore that we want to delete
            data: () => ({
                codigo_pieza: 'orphan-sub-123',
                descripcion: 'An orphaned sub-product.'
                // NOTE: This mock deliberately does NOT have an 'id' field in its data.
            })
        };
        const orphanedQuerySnapshot = {
            docs: [orphanedSubProductDoc],
            empty: false
        };
        // This mock is for the query inside the loop that searches for the orphan to delete.
        mockFirestore.getDocs.mockResolvedValueOnce(orphanedQuerySnapshot);

        // --- 2. EXECUTION ---
        await deleteProductAndOrphanedSubProducts(
            mainProduct.docId,
            mockDb,
            mockFirestore,
            COLLECTIONS,
            mockUiCallbacks
        );

        // --- 3. ASSERTIONS ---

        // It should query using the correct unique key 'codigo_pieza' because of the fix.
        expect(mockFirestore.where).toHaveBeenCalledWith('codigo_pieza', '==', 'orphan-sub-123');

        // It should NOT have tried to query using the old, buggy 'id' field.
        expect(mockFirestore.where).not.toHaveBeenCalledWith('id', '==', 'orphan-sub-123');

        // Most importantly, it should have called deleteDoc with the correct document reference.
        // It's called twice: once for the main product, once for the orphan.
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);
        expect(mockFirestore.deleteDoc).toHaveBeenCalledWith(
             mockFirestore.doc(mockDb, COLLECTIONS.SEMITERMINADOS, orphanedSubProductDoc.id)
        );

        // Check if user feedback was appropriate.
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
        expect(mockUiCallbacks.runTableLogic).toHaveBeenCalled();
    });

    test('should correctly identify and delete an orphan when it is only used by the product being deleted', async () => {
        // Arrange
        const productToDeleteId = 'PROD_A';
        const productToDeleteData = {
            id: productToDeleteId,
            estructura: [{ tipo: 'semiterminado', refId: 'ORPHAN_SUB' }]
        };

        const otherProductData = {
            id: 'PROD_B',
            estructura: [{ tipo: 'semiterminado', refId: 'USED_SUB' }]
        };

        const orphanSubProductData = { id: 'ORPHAN_SUB' };

        // 1. Mock getDoc for the product to be deleted
        mockFirestore.getDoc.mockResolvedValueOnce({
            exists: () => true,
            data: () => productToDeleteData
        });

        // 2. Mock getDocs for fetching "all" products.
        // THIS IS THE CORE OF THE BUG: The buggy code fetches ALL products, including the one being deleted.
        mockFirestore.getDocs
            .mockResolvedValueOnce({
                docs: [
                    { id: productToDeleteId, data: () => productToDeleteData },
                    { id: 'PROD_B', data: () => otherProductData }
                ]
            })
            // 3. Mock getDocs for finding the orphan sub-product to delete it
            .mockResolvedValueOnce({
                docs: [{ id: 'ORPHAN_SUB_DOC_ID', data: () => orphanSubProductData }]
            });

        // Act
        await deleteProductAndOrphanedSubProducts(productToDeleteId, mockDb, mockFirestore, COLLECTIONS, mockUiCallbacks);

        // Assert
        // A correct implementation should call deleteDoc twice: once for the product, once for the orphan.
        expect(mockFirestore.deleteDoc).toHaveBeenCalledTimes(2);

        // Verify it was called for the orphan
        expect(mockFirestore.doc).toHaveBeenCalledWith(mockDb, COLLECTIONS.SEMITERMINADOS, 'ORPHAN_SUB_DOC_ID');
        expect(mockUiCallbacks.showToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });
});

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { deleteProductAndOrphanedSubProducts } from '../../public/data_logic.js';
import { COLLECTIONS } from '../../public/utils.js';

// --- Mock Firestore and UI dependencies ---
const mockShowToast = jest.fn();
const mockRunTableLogic = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockDeleteDoc = jest.fn();
const mockCollection = jest.fn((db, name) => name);
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockLimit = jest.fn();
const mockDoc = jest.fn((db, collection, id) => ({ path: `${collection}/${id}` }));

// The mockFirestore object now includes 'limit'
const mockFirestore = {
    doc: mockDoc,
    getDoc: mockGetDoc,
    getDocs: mockGetDocs,
    deleteDoc: mockDeleteDoc,
    collection: mockCollection,
    query: mockQuery,
    where: mockWhere,
    limit: mockLimit,
};

const mockUiCallbacks = {
    showToast: mockShowToast,
    runTableLogic: mockRunTableLogic,
};

describe('deleteProductAndOrphanedSubProducts (Optimized)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Link the mock implementations together to simulate the query chain
        // We return a unique object for each mock so we can identify it later.
        mockWhere.mockImplementation((field, op, value) => ({ type: 'where', value }));
        mockLimit.mockImplementation(limit => ({ type: 'limit', value: limit }));
        mockQuery.mockImplementation((collection, ...constraints) => ({
            type: 'query',
            collection,
            constraints
        }));
    });

    test('[FIX] should delete an orphaned sub-component using an efficient query', async () => {
        // --- ARRANGE ---
        const mainProductId = 'PRODUCT-MAIN-123';
        const orphanSubProductId = 'SUBPROD-ORPHAN-456';
        const usedSubProductId = 'SUBPROD-USED-789';

        const mainProductData = {
            id: mainProductId,
            codigo_pieza: 'P-001',
            estructura: [
                { tipo: 'semiterminado', refId: orphanSubProductId, quantity: 1 },
                { tipo: 'semiterminado', refId: usedSubProductId, quantity: 1 }
            ]
        };

        // Mock for getDoc to fetch the main product and the sub-products before deletion.
        mockGetDoc.mockImplementation(async (docRef) => {
            if (docRef.path === `productos/${mainProductId}`) {
                return { exists: () => true, data: () => mainProductData };
            }
            if (docRef.path === `semiterminados/${orphanSubProductId}`) {
                return { exists: () => true, data: () => ({ id: orphanSubProductId }) };
            }
            return { exists: () => false, data: () => null };
        });

        // Mock for getDocs to simulate the result of the 'array-contains' query.
        mockGetDocs.mockImplementation(async (queryInstance) => {
            // This mock is now more robust. It checks the content of the query it receives.
            const hasOrphan = queryInstance.constraints.some(c => c.type === 'where' && c.value === orphanSubProductId);
            const hasUsed = queryInstance.constraints.some(c => c.type === 'where' && c.value === usedSubProductId);

            if (hasOrphan) {
                return { empty: true, docs: [] }; // The orphan is not used elsewhere.
            }
            if (hasUsed) {
                return { empty: false, docs: [{ id: 'some-other-product' }] }; // The used component is found in another product.
            }
            return { empty: true, docs: [] };
        });

        // --- ACT ---
        await deleteProductAndOrphanedSubProducts(mainProductId, 'mockDb', mockFirestore, COLLECTIONS, mockUiCallbacks);

        // --- ASSERT ---
        // 1. The main product should have been deleted.
        expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `productos/${mainProductId}` }));

        // 2. The code should use `where` and `limit` for its queries.
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockWhere).toHaveBeenCalledWith('component_ids', 'array-contains', orphanSubProductId);
        expect(mockWhere).toHaveBeenCalledWith('component_ids', 'array-contains', usedSubProductId);
        expect(mockLimit).toHaveBeenCalledWith(1);
        expect(mockLimit).toHaveBeenCalledTimes(2);

        // 3. The orphaned sub-product should be deleted.
        expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `semiterminados/${orphanSubProductId}` }));

        // 4. The sub-product that is still in use should NOT be deleted.
        expect(mockDeleteDoc).not.toHaveBeenCalledWith(expect.objectContaining({ path: `semiterminados/${usedSubProductId}` }));

        // 5. Verify delete was called exactly twice (main product + orphan)
        expect(mockDeleteDoc).toHaveBeenCalledTimes(2);
    });

    test('[NEW] should delete an orphaned insumo component using an efficient query', async () => {
        // --- ARRANGE ---
        const mainProductId = 'PROD-MAIN-INSU';
        const orphanInsumoId = 'INSU-ORPHAN-123';

        const mainProductData = {
            id: mainProductId,
            estructura: [{ tipo: 'insumo', refId: orphanInsumoId, quantity: 1 }]
        };

        mockGetDoc.mockImplementation(async (docRef) => {
            if (docRef.path === `productos/${mainProductId}`) {
                return { exists: () => true, data: () => mainProductData };
            }
            if (docRef.path === `insumos/${orphanInsumoId}`) {
                return { exists: () => true, data: () => ({ id: orphanInsumoId }) };
            }
            return { exists: () => false, data: () => null };
        });

        // The query for the insumo should return an empty snapshot, indicating it's an orphan.
        mockGetDocs.mockResolvedValue({ empty: true, docs: [] });

        // --- ACT ---
        await deleteProductAndOrphanedSubProducts(mainProductId, 'mockDb', mockFirestore, COLLECTIONS, mockUiCallbacks);

        // --- ASSERT ---
        // 1. Verify the correct query was made for the insumo.
        expect(mockWhere).toHaveBeenCalledWith('component_ids', 'array-contains', orphanInsumoId);
        expect(mockLimit).toHaveBeenCalledWith(1);

        // 2. Verify that deleteDoc was called for both the product and the orphaned insumo.
        expect(mockDeleteDoc).toHaveBeenCalledTimes(2);
        expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `productos/${mainProductId}` }));
        expect(mockDeleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `insumos/${orphanInsumoId}` }));

        // 3. Check for the correct success message.
        expect(mockShowToast).toHaveBeenCalledWith('1 sub-componentes huérfanos eliminados.', 'success');
    });
});

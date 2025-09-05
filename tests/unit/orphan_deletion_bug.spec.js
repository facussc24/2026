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
const mockDoc = jest.fn((db, collection, id) => ({ path: `${collection}/${id}` }));

const mockFirestore = {
    doc: mockDoc,
    getDoc: mockGetDoc,
    getDocs: mockGetDocs,
    deleteDoc: mockDeleteDoc,
    collection: mockCollection,
    query: mockQuery,
    where: mockWhere,
};

const mockUiCallbacks = {
    showToast: mockShowToast,
    runTableLogic: mockRunTableLogic,
};

describe('deleteProductAndOrphanedSubProducts', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('[FIX] should delete an orphaned sub-component when its parent product is deleted', async () => {
        // --- ARRANGE ---
        const mainProductId = 'PRODUCT-MAIN-123';
        const orphanSubProductId = 'SUBPROD-ORPHAN-456';
        const usedSubProductId = 'SUBPROD-USED-789';

        const mainProductData = {
            id: mainProductId,
            codigo_pieza: 'P-001',
            estructura: [
                { tipo: 'semiterminado', refId: orphanSubProductId },
                { tipo: 'semiterminado', refId: usedSubProductId }
            ]
        };

        const otherProductData = {
            id: 'PRODUCT-OTHER-XYZ',
            codigo_pieza: 'P-002',
            estructura: [
                { tipo: 'semiterminado', refId: usedSubProductId }
            ]
        };

        // Mock for getDocs to fetch all products for dependency checking.
        const allProductsSnapshot = {
            docs: [
                { id: 'PRODUCT-OTHER-XYZ', data: () => otherProductData },
                { id: mainProductId, data: () => mainProductData }
            ]
        };
        mockGetDocs.mockResolvedValue(allProductsSnapshot);

        // Mock for getDoc. It needs to handle three cases now:
        // 1. Fetching the main product to be deleted.
        // 2. The new logic checking if the orphan exists before deleting it.
        // 3. The new logic checking if the used sub-product exists (it shouldn't get this far, but good to be robust).
        mockGetDoc.mockImplementation(async (docRef) => {
            if (docRef.path === `productos/${mainProductId}`) {
                return { exists: () => true, data: () => mainProductData };
            }
            if (docRef.path === `semiterminados/${orphanSubProductId}`) {
                return { exists: () => true, data: () => ({ id: orphanSubProductId, codigo_pieza: 'SP-ORPHAN' }) };
            }
            // For any other doc, say it doesn't exist.
            return { exists: () => false, data: () => null };
        });

        // --- ACT ---
        await deleteProductAndOrphanedSubProducts(mainProductId, 'mockDb', mockFirestore, COLLECTIONS, mockUiCallbacks);

        // --- ASSERT ---
        // 1. The main product should have been deleted.
        const mainProductDocRef = { path: 'productos/PRODUCT-MAIN-123' };
        expect(mockDeleteDoc).toHaveBeenCalledWith(mainProductDocRef);

        // 2. The code should no longer be using a `where` query for this.
        expect(mockWhere).not.toHaveBeenCalled();

        // 3. CRITICAL: Because the code is now fixed, it should find the orphan via getDoc
        // and then call deleteDoc on it. This assertion now verifies the fix.
        const orphanSubProductDocRef = { path: 'semiterminados/SUBPROD-ORPHAN-456' };
        expect(mockDeleteDoc).toHaveBeenCalledWith(orphanSubProductDocRef);

        // 4. The used sub-product should NOT have been deleted.
        const usedSubProductDocRef = { path: 'semiterminados/SUBPROD-USED-789' };
        expect(mockDeleteDoc).not.toHaveBeenCalledWith(usedSubProductDocRef);

        // 5. Verify delete was called exactly twice (main product + orphan)
        expect(mockDeleteDoc).toHaveBeenCalledTimes(2);
    });
});

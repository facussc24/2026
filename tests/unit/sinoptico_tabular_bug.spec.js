import { jest, describe, test, expect, afterEach } from '@jest/globals';
// Import the real appState and the function to test
import { appState, getFlattenedData } from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

describe('getFlattenedData Level Filtering Logic', () => {

    afterEach(() => {
        // Restore all mocks after each test to ensure test isolation
        jest.restoreAllMocks();
    });

    test('should correctly preserve originalLevel and calculate visual level when filtered', () => {
        // --- ARRANGE ---
        // 1. Define the mock data that our spies will return
        const mockProductItem = { id: 'PROD-01', descripcion: 'Producto Principal' };
        const mockSemiItem = { id: 'SEMI-01', descripcion: 'Semiterminado Nivel 1' };
        const mockInsumoItem = { id: 'INSUMO-01', descripcion: 'Insumo Nivel 2' };

        // 2. Ensure the maps we need to spy on exist in the real appState object
        appState.collectionsById[COLLECTIONS.PRODUCTOS] = new Map();
        appState.collectionsById[COLLECTIONS.SEMITERMINADOS] = new Map();
        appState.collectionsById[COLLECTIONS.INSUMOS] = new Map();

        // 3. Spy on the .get() method of the real appState's maps and mock their implementations
        jest.spyOn(appState.collectionsById[COLLECTIONS.PRODUCTOS], 'get').mockImplementation(key => {
            if (key === 'PROD-01') return mockProductItem;
        });
        jest.spyOn(appState.collectionsById[COLLECTIONS.SEMITERMINADOS], 'get').mockImplementation(key => {
            if (key === 'SEMI-01') return mockSemiItem;
        });
        jest.spyOn(appState.collectionsById[COLLECTIONS.INSUMOS], 'get').mockImplementation(key => {
            if (key === 'INSUMO-01') return mockInsumoItem;
        });

        // 4. Create the mock product structure that will be passed to the function
        const mockProduct = {
            id: 'PROD-01',
            descripcion: 'Producto Principal',
            estructura: [
                { // Level 0
                    id: 'node-0', refId: 'PROD-01', tipo: 'producto',
                    children: [
                        { // Level 1
                            id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado',
                            children: [
                                { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', children: [] } // Level 2
                            ]
                        }
                    ]
                }
            ]
        };

        // 5. Define the filter: we only want to see levels 0 and 2
        const levelFilters = new Set(['0', '2']);

        // --- ACT ---
        // Call the function under test. It will use the real appState, but our spies will intercept the .get() calls.
        const flattenedData = getFlattenedData(mockProduct, levelFilters);

        // --- ASSERT ---
        // The resulting flattened array should contain only two items: the product and the insumo.
        expect(flattenedData).toHaveLength(2);

        const productData = flattenedData.find(d => d.node.refId === 'PROD-01');
        const insumoData = flattenedData.find(d => d.node.refId === 'INSUMO-01');

        // Verify the Product (Level 0)
        expect(productData).toBeDefined();
        expect(productData.node.originalLevel).toBe(0); // Its original level was 0.
        expect(productData.level).toBe(0);               // Its visual level in the filtered view is 0.

        // Verify the Insumo (Level 2)
        expect(insumoData).toBeDefined();
        expect(insumoData.node.originalLevel).toBe(2); // Its original level was 2.
        expect(insumoData.level).toBe(1);               // Its visual level is 1 because level 1 was filtered out.

        // This confirms that `node.originalLevel` contains the correct, persistent level (2),
        // which is what the rendering function needs to fix the bug.
    });
});

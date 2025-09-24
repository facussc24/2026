import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { getFlattenedData } from '../../public/modules/products/product-logic.js';
import { renderNodo } from '../../public/modules/products/product-ui.js';

const appState = {
    collectionsById: {},
};
import { COLLECTIONS } from '../../public/utils.js';

describe('renderNodo HTML Structure', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('should generate correct flexbox structure without absolute positioning for actions', () => {
        // --- ARRANGE ---
        // 1. Create a simple mock for the permission function.
        const mockCheckPermission = () => true;

        // 2. Mock the necessary data in appState
        const mockSemiproducto = { id: 'SEMI-01', descripcion: 'Componente de prueba' };
        appState.collectionsById[COLLECTIONS.SEMITERMINADOS] = new Map([
            ['SEMI-01', mockSemiproducto]
        ]);
        appState.collectionsById[COLLECTIONS.INSUMOS] = new Map();
        appState.collectionsById[COLLECTIONS.PRODUCTOS] = new Map();

        // 3. Define the sample node to be rendered
        const nodo = {
            id: 'test-node-1',
            refId: 'SEMI-01',
            tipo: 'semiterminado',
            icon: 'box',
            quantity: 5,
            comment: 'Test comment',
            children: []
        };

        // --- ACT ---
        // 4. Call the function, injecting our mock permission checker
        const htmlString = renderNodo(nodo, mockCheckPermission);

        // 5. Parse the HTML string into a DOM element for inspection
        const dom = new DOMParser().parseFromString(htmlString, 'text/html');
        const nodeContent = dom.querySelector('.node-content');
        const nodeActions = dom.querySelector('.node-actions');

        // --- ASSERT ---
        // 6. Verify the structure
        expect(nodeContent).not.toBeNull();
        expect(nodeActions).not.toBeNull();

        // Key assertion: The actions container should be a direct child of the main content div
        expect(nodeContent.contains(nodeActions)).toBe(true);

        // 7. Verify the classes (the core of the bug fix)
        // The main content should NOT have the fixed padding anymore
        expect(nodeContent.classList.contains('pr-28')).toBe(false);

        // The actions container should NOT be absolutely positioned
        expect(nodeActions.classList.contains('absolute')).toBe(false);
    });
});

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

    test('[FIX] should not include intermediate levels when filtering for a deep level', () => {
        // --- ARRANGE ---
        // 1. Mock the necessary data lookups in appState
        appState.collectionsById = {
            [COLLECTIONS.PRODUCTOS]: new Map([['PROD-02', { id: 'PROD-02', descripcion: 'Producto' }]]),
            [COLLECTIONS.SEMITERMINADOS]: new Map([
                ['SEMI-L1', { id: 'SEMI-L1', descripcion: 'Semi Nivel 1' }],
                ['SEMI-L2', { id: 'SEMI-L2', descripcion: 'Semi Nivel 2' }],
                ['SEMI-L3', { id: 'SEMI-L3', descripcion: 'Semi Nivel 3' }],
            ]),
            [COLLECTIONS.INSUMOS]: new Map([
                ['INSUMO-L4', { id: 'INSUMO-L4', descripcion: 'Insumo Nivel 4' }]
            ]),
        };

        // 2. Create a deep product structure
        const mockProduct = {
            id: 'PROD-02',
            estructura: [
                { // Level 0
                    id: 'node-0', refId: 'PROD-02', tipo: 'producto',
                    children: [
                        { // Level 1
                            id: 'node-1', refId: 'SEMI-L1', tipo: 'semiterminado',
                            children: [
                                { // Level 2
                                    id: 'node-2', refId: 'SEMI-L2', tipo: 'semiterminado',
                                    children: [
                                        { // Level 3 (Should be filtered out)
                                            id: 'node-3', refId: 'SEMI-L3', tipo: 'semiterminado',
                                            children: [
                                                { id: 'node-4', refId: 'INSUMO-L4', tipo: 'insumo', children: [] } // Level 4
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        // 3. Filter to show only the root (level 0) and the deepest item (level 4)
        const levelFilters = new Set(['0', '4']);

        // --- ACT ---
        const flattenedData = getFlattenedData(mockProduct, levelFilters);

        // --- ASSERT ---
        // The result should only contain the product (level 0) and the insumo (level 4).
        expect(flattenedData).toHaveLength(2);

        const productData = flattenedData.find(d => d.node.refId === 'PROD-02');
        const insumoData = flattenedData.find(d => d.node.refId === 'INSUMO-L4');
        const intermediateLevel3 = flattenedData.find(d => d.node.refId === 'SEMI-L3');

        // Check that the correct items are present
        expect(productData).toBeDefined();
        expect(insumoData).toBeDefined();

        // Crucially, check that the intermediate level was NOT included in the output
        expect(intermediateLevel3).toBeUndefined();

        // Verify original and visual levels
        expect(productData.node.originalLevel).toBe(0);
        expect(productData.level).toBe(0); // Visual level

        expect(insumoData.node.originalLevel).toBe(4);
        expect(insumoData.level).toBe(1); // Visual level is 1 because levels 1, 2, and 3 were filtered out
    });
});

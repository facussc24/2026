import { getFlattenedData } from '../../public/main.js';
// Import the real appState so we can modify it for our tests
import { appState } from '../../public/main.js';

// Mock data setup
const mockProduct = {
    id: 'PROD-A',
    descripcion: 'Product A',
    estructura: [
        {
            id: 'node-1',
            refId: 'PROD-A',
            tipo: 'producto',
            children: [
                {
                    id: 'node-2',
                    refId: 'SEMI-B',
                    tipo: 'semiterminado',
                    children: [
                        { id: 'node-3', refId: 'INS-C', tipo: 'insumo', children: [] }
                    ]
                },
                { id: 'node-4', refId: 'INS-D', tipo: 'insumo', children: [] }
            ]
        }
    ]
};

const mockCollections = {
    productos: [{ id: 'PROD-A', descripcion: 'Product A' }],
    semiterminados: [{ id: 'SEMI-B', descripcion: 'Semi-finished B' }],
    insumos: [{ id: 'INS-C', descripcion: 'Insumo C' }, { id: 'INS-D', descripcion: 'Insumo D' }]
};

describe('getFlattenedData with level filters', () => {
    beforeEach(() => {
        // Reset and mock appState for each test by directly modifying the imported object.
        Object.assign(appState, {
            collectionsById: {
                productos: new Map(mockCollections.productos.map(i => [i.id, i])),
                semiterminados: new Map(mockCollections.semiterminados.map(i => [i.id, i])),
                insumos: new Map(mockCollections.insumos.map(i => [i.id, i])),
            }
        });
    });

    it('should return an empty array when the level filter is an empty set (user deselected all)', () => {
        const activeFilters = {
            niveles: new Set(), // Empty set represents user deselecting all levels
            material: ''
        };
        const flattenedData = getFlattenedData(mockProduct, activeFilters);
        // The correct behavior is to return an empty array.
        expect(flattenedData.length).toBe(0);
    });

    it('should return all nodes when the level filter is null (initial load)', () => {
        const activeFilters = {
            niveles: null, // Null represents the filter not being used yet
            material: ''
        };
        const flattenedData = getFlattenedData(mockProduct, activeFilters);
        // On initial load (null filter), all nodes should be returned.
        expect(flattenedData.length).toBe(4);
        expect(flattenedData.map(d => d.node.refId)).toEqual(['PROD-A', 'SEMI-B', 'INS-C', 'INS-D']);
    });

    it('should return only nodes of the specified levels', () => {
        const activeFilters = {
            niveles: new Set(['0', '2']), // Filter for level 0 (Product) and 2 (Insumos under Semiterminado)
            material: ''
        };
        const flattenedData = getFlattenedData(mockProduct, activeFilters);
        expect(flattenedData.length).toBe(2);
        expect(flattenedData.map(d => d.node.refId)).toEqual(['PROD-A', 'INS-C']);
    });
});

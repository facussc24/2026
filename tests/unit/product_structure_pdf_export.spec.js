import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { prepareDataForPdfAutoTable } from '../../public/utils.js';
import { getFlattenedData, appState } from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

// Mock the getFlattenedData function using the CommonJS-style requireActual
// because babel-jest is transforming the modules.
jest.mock('../../public/main.js', () => ({
    ...jest.requireActual('../../public/main.js'),
    getFlattenedData: jest.fn(),
}));

describe('prepareDataForPdfAutoTable', () => {
    let mockCollectionsById;
    let mockFlattenedData;

    beforeEach(() => {
        // Reset mocks and appState before each test
        getFlattenedData.mockClear();

        mockCollectionsById = {
            [COLLECTIONS.PRODUCTOS]: new Map([['PROD-TEST', { id: 'PROD-TEST', descripcion: 'Producto de Prueba', version: '1.0', proceso: 'ENSAMBLAJE' }]]),
            [COLLECTIONS.SEMITERMINADOS]: new Map([['SEMI-01', { id: 'SEMI-01', descripcion: 'Semiterminado Principal', version: '1.1', proceso: 'MECANIZADO' }]]),
            [COLLECTIONS.INSUMOS]: new Map([
                ['INSUMO-01', { id: 'INSUMO-01', descripcion: 'Insumo A', version: '2.0', unidad_medida: 'kg' }],
                ['INSUMO-02', { id: 'INSUMO-02', descripcion: 'Insumo B', version: '2.1', unidad_medida: 'm' }]
            ]),
            [COLLECTIONS.PROCESOS]: new Map([
                ['ENSAMBLAJE', { id: 'ENSAMBLAJE', descripcion: 'Ensamblaje Final' }],
                ['MECANIZADO', { id: 'MECANIZADO', descripcion: 'Mecanizado CNC' }]
            ]),
            [COLLECTIONS.UNIDADES]: new Map([
                ['kg', { id: 'kg', descripcion: 'Kilogramos' }],
                ['m', { id: 'm', descripcion: 'Metros' }]
            ]),
        };

        // This mock data now has the CORRECT lineage values to produce the expected tree prefixes.
        mockFlattenedData = [
            {
                node: { id: 'node-0', refId: 'PROD-TEST', tipo: 'producto' },
                item: mockCollectionsById[COLLECTIONS.PRODUCTOS].get('PROD-TEST'),
                level: 0, isLast: true, lineage: []
            },
            {
                node: { id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado', quantity: 2 },
                item: mockCollectionsById[COLLECTIONS.SEMITERMINADOS].get('SEMI-01'),
                level: 1, isLast: false, lineage: [] // Corrected
            },
            {
                node: { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', quantity: 5, comment: 'Comentario de prueba' },
                item: mockCollectionsById[COLLECTIONS.INSUMOS].get('INSUMO-01'),
                level: 2, isLast: true, lineage: [true] // Corrected
            },
            {
                node: { id: 'node-3', refId: 'INSUMO-02', tipo: 'insumo', quantity: 10 },
                item: mockCollectionsById[COLLECTIONS.INSUMOS].get('INSUMO-02'),
                level: 1, isLast: true, lineage: [] // Corrected
            }
        ];

        getFlattenedData.mockReturnValue(mockFlattenedData);

        // Mock the global appState
        appState.collectionsById = mockCollectionsById;
        appState.sinopticoTabularState = {
            selectedProduct: { docId: 'PROD-TEST', id: 'PROD-TEST', descripcion: 'Producto de Prueba' },
        };
    });

    test('should separate data into body for table and rawData for metadata', () => {
        // --- ARRANGE ---
        const flattenedData = getFlattenedData(); // Uses the mocked return value
        const product = appState.sinopticoTabularState.selectedProduct;
        const collections = appState.collectionsById;

        // --- ACT ---
        const result = prepareDataForPdfAutoTable(flattenedData, collections, product);

        // --- ASSERT ---
        // 1. Check the overall structure
        expect(result).toHaveProperty('body');
        expect(result).toHaveProperty('rawData');
        expect(result.body).toBeInstanceOf(Array);
        expect(result.rawData).toBeInstanceOf(Array);
        expect(result.body).toHaveLength(4);
        expect(result.rawData).toHaveLength(4);

        // 2. Check the rawData
        // The implementation now does a deep copy, so we expect the content to be the same.
        expect(result.rawData).toEqual(mockFlattenedData);

        // 3. Check the body data (formatted for PDF)
        const [producto, semi, insumo1, insumo2] = result.body;

        // Row 1: Producto
        expect(producto.descripcion).toBe('Producto de Prueba');
        expect(producto.version).toBe('1.0');
        expect(producto.proceso).toBe('Ensamblaje Final');
        expect(producto.cantidad).toBe('1');

        // Row 2: Semiterminado
        expect(semi.descripcion).toBe('├─ Semiterminado Principal');
        expect(semi.cantidad).toBe('2');
        expect(semi.proceso).toBe('Mecanizado CNC');

        // Row 3: Insumo 1
        expect(insumo1.descripcion).toBe('│  └─ Insumo A');
        expect(insumo1.cantidad).toBe('5');
        expect(insumo1.unidad).toBe('kg');
        expect(insumo1.comentarios).toBe('Comentario de prueba');

        // Row 4: Insumo 2
        expect(insumo2.descripcion).toBe('└─ Insumo B');
        expect(insumo2.cantidad).toBe('10');
        expect(insumo2.unidad).toBe('m');
    });
});

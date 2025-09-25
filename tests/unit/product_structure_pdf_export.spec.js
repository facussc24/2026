import { describe, test, expect, beforeEach } from '@jest/globals';
import { prepareDataForPdfAutoTable, COLLECTIONS } from '../../public/utils.js';

import { appState } from '../../public/state.js';

describe('prepareDataForPdfAutoTable', () => {
    let mockCollectionsById;
    let mockFlattenedData;

    beforeEach(() => {
        mockCollectionsById = {
            [COLLECTIONS.PRODUCTOS]: new Map([['PROD-TEST', { id: 'PROD-TEST', descripcion: 'Producto de Prueba', version: '1.0', proceso: 'ENSAMBLAJE' }]]),
            [COLLECTIONS.SEMITERMINADOS]: new Map([['SEMI-01', { id: 'SEMI-01', descripcion: 'Semiterminado Principal', version: '1.1', proceso: 'MECANIZADO' }]]),
            [COLLECTIONS.INSUMOS]: new Map([
                ['INSUMO-01', { id: 'INSUMO-01', descripcion: 'Insumo A', version: '2.0', unidad_medida: 'kg', proveedor_materia_prima: 'PROV-MP-A' }],
                ['INSUMO-02', { id: 'INSUMO-02', descripcion: 'Insumo B', version: '2.1', unidad_medida: 'm', proveedor_materia_prima: 'PROV-MP-B' }]
            ]),
            [COLLECTIONS.PROCESOS]: new Map([
                ['ENSAMBLAJE', { id: 'ENSAMBLAJE', descripcion: 'Ensamblaje Final' }],
                ['MECANIZADO', { id: 'MECANIZADO', descripcion: 'Mecanizado CNC' }]
            ]),
            [COLLECTIONS.UNIDADES]: new Map([
                ['kg', { id: 'kg', descripcion: 'Kilogramos' }],
                ['m', { id: 'm', descripcion: 'Metros' }]
            ]),
            [COLLECTIONS.PROVEEDORES]: new Map([
                ['PROV-MP-A', { id: 'PROV-MP-A', descripcion: 'Proveedor de Materia Prima A' }],
                ['PROV-MP-B', { id: 'PROV-MP-B', descripcion: 'Proveedor de Materia Prima B' }]
            ]),
        };

        mockFlattenedData = [
            {
                node: { id: 'node-0', refId: 'PROD-TEST', tipo: 'producto' },
                item: mockCollectionsById[COLLECTIONS.PRODUCTOS].get('PROD-TEST'),
                level: 0, isLast: true, lineage: []
            },
            {
                node: { id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado', quantity: 2 },
                item: mockCollectionsById[COLLECTIONS.SEMITERMINADOS].get('SEMI-01'),
                level: 1, isLast: false, lineage: []
            },
            {
                node: { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', quantity: 5, comment: 'Comentario de prueba' },
                item: mockCollectionsById[COLLECTIONS.INSUMOS].get('INSUMO-01'),
                level: 2, isLast: true, lineage: [true] // Corrected: parent is not last, so draw a line.
            },
            {
                node: { id: 'node-3', refId: 'INSUMO-02', tipo: 'insumo', quantity: 10 },
                item: mockCollectionsById[COLLECTIONS.INSUMOS].get('INSUMO-02'),
                level: 1, isLast: true, lineage: []
            }
        ];

        // Mock the global appState directly
        appState.collectionsById = mockCollectionsById;
        appState.sinopticoTabularState = {
            selectedProduct: { docId: 'PROD-TEST', id: 'PROD-TEST', descripcion: 'Producto de Prueba' },
        };
    });

    test('should separate data into body for table and rawData for metadata', () => {
        // --- ARRANGE ---
        const flattenedData = mockFlattenedData;
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

        // 2. Check the rawData (it should be a deep copy of the input)
        expect(result.rawData).toEqual(mockFlattenedData);
        expect(result.rawData).not.toBe(mockFlattenedData); // Ensure it's a copy, not the same object

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

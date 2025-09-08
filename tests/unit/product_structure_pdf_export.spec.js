import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { prepareDataForPdfAutoTable } from '../../public/utils.js';
import { getFlattenedData } from '../../public/main.js';
import { appState } from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

describe('prepareDataForPdfAutoTable', () => {

    beforeEach(() => {
        // Mock the global appState required by getFlattenedData
        const mockProduct = {
            docId: 'PROD-TEST',
            id: 'PROD-TEST',
            descripcion: 'Producto de Prueba',
            clienteId: 'CLIENTE-A',
            estructura: [
                { // Nivel 0
                    id: 'node-0', refId: 'PROD-TEST', tipo: 'producto',
                    children: [
                        { // Nivel 1
                            id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado', quantity: 2,
                            children: [
                                { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', quantity: 5, comment: 'Comentario de prueba' } // Nivel 2
                            ]
                        },
                        { // Nivel 1 (último hijo)
                            id: 'node-3', refId: 'INSUMO-02', tipo: 'insumo', quantity: 10
                        }
                    ]
                }
            ]
        };

        appState.collectionsById = {
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

        // Mock the state for getFlattenedData
        appState.sinopticoTabularState = {
            selectedProduct: mockProduct,
            activeFilters: {
                niveles: new Set() // No level filters for this test
            }
        };
    });

    test('should return a single array with combined display and metadata', () => {
        // --- ARRANGE ---
        const flattenedData = getFlattenedData(appState.sinopticoTabularState.selectedProduct, new Set());
        const product = appState.sinopticoTabularState.selectedProduct;

        // --- ACT ---
        const result = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById, product);

        // --- ASSERT ---
        // 1. Check the overall structure and length
        expect(result).toBeInstanceOf(Array);
        expect(result).toHaveLength(4);

        // 2. Check the combined data in each object
        const [producto, semi, insumo1, insumo2] = result;

        // Row 1: Producto
        expect(producto).toHaveProperty('level', 0);
        expect(producto).toHaveProperty('isLast', true);
        expect(producto).toHaveProperty('lineage', []);
        expect(producto).toHaveProperty('descripcion', 'Producto de Prueba');
        expect(producto).toHaveProperty('version', '1.0');
        expect(producto).toHaveProperty('proceso', 'Ensamblaje Final');
        expect(producto).toHaveProperty('cantidad', '1');

        // Row 2: Semiterminado
        expect(semi).toHaveProperty('level', 1);
        expect(semi).toHaveProperty('isLast', false);
        expect(semi).toHaveProperty('lineage', [false]);
        expect(semi).toHaveProperty('descripcion', 'Semiterminado Principal');
        expect(semi).toHaveProperty('cantidad', '2');
        expect(semi).toHaveProperty('proceso', 'Mecanizado CNC');

        // Row 3: Insumo 1
        expect(insumo1).toHaveProperty('level', 2);
        expect(insumo1).toHaveProperty('isLast', true);
        expect(insumo1).toHaveProperty('lineage', [false, true]);
        expect(insumo1).toHaveProperty('descripcion', 'Insumo A');
        expect(insumo1).toHaveProperty('cantidad', '5');
        expect(insumo1).toHaveProperty('unidad', 'kg');
        expect(insumo1).toHaveProperty('comentarios', 'Comentario de prueba');

        // Row 4: Insumo 2
        expect(insumo2).toHaveProperty('level', 1);
        expect(insumo2).toHaveProperty('isLast', true);
        expect(insumo2).toHaveProperty('lineage', [false]);
        expect(insumo2).toHaveProperty('descripcion', 'Insumo B');
        expect(insumo2).toHaveProperty('cantidad', '10');
        expect(insumo2).toHaveProperty('unidad', 'm');
    });
});

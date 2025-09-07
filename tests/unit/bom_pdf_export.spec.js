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

    test('should transform flattened data into head and body arrays for jspdf-autotable', () => {
        // --- ARRANGE ---
        // getFlattenedData uses the global appState which is set up in beforeEach
        const flattenedData = getFlattenedData(appState.sinopticoTabularState.selectedProduct, new Set());

        // --- ACT ---
        const result = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById);

        // --- ASSERT ---
        // 1. Check Headers
        const expectedHead = [['Nivel', 'Descripción', 'Código', 'Versión', 'Proceso', 'Cantidad', 'Unidad', 'Comentarios']];
        expect(result.head).toEqual(expectedHead);

        // 2. Check Body length (should be 4 rows for our mock data)
        expect(result.body).toHaveLength(4);

        // 3. Check content of specific rows
        const [productoRow, semiRow, insumo1Row, insumo2Row] = result.body;

        // Row 1: Producto
        expect(productoRow[1]).toBe('Producto de Prueba'); // Descripción (limpia, sin prefijo)

        // Row 2: Semiterminado
        expect(semiRow[1]).toBe('Semiterminado Principal'); // Descripción (limpia, sin prefijo)

        // Row 3: Insumo anidado
        expect(insumo1Row[1]).toBe('Insumo A'); // Descripción (limpia, sin prefijo)
        expect(insumo1Row[7]).toBe('Comentario de prueba'); // Comentarios

        // Row 4: Último insumo
        expect(insumo2Row[1]).toBe('Insumo B'); // Descripción (limpia, sin prefijo)
    });
});

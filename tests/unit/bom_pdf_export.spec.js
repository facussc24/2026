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

    test('should transform flattened data into an array of objects for jspdf-autotable', () => {
        // --- ARRANGE ---
        const flattenedData = getFlattenedData(appState.sinopticoTabularState.selectedProduct, new Set());

        // --- ACT ---
        const result = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById);

        // --- ASSERT ---
        // 1. Check the overall structure
        expect(result).toHaveProperty('body');
        expect(result.head).toBeUndefined();

        // 2. Check Body length
        const { body } = result;
        expect(body).toBeInstanceOf(Array);
        expect(body).toHaveLength(4);

        // 3. Check the content and metadata of specific objects in the body
        const [productoRow, semiRow, insumo1Row, insumo2Row] = body;

        // Row 1: Producto (Root)
        expect(productoRow.level).toBe(0);
        expect(productoRow.descripcion).toBe('Producto de Prueba');
        expect(productoRow.isLast).toBe(true);
        expect(productoRow.lineage).toEqual([]); // Root has no lineage

        // Row 2: Semiterminado (Child of Root)
        expect(semiRow.level).toBe(1);
        expect(semiRow.isLast).toBe(false); // Not the last child of the product
        expect(semiRow.lineage).toEqual([false]); // Its parent (root) was the last child, so no vertical line needed

        // Row 3: Insumo (Child of Semiterminado)
        expect(insumo1Row.level).toBe(2);
        expect(insumo1Row.isLast).toBe(true); // Last (and only) child of the semiterminado
        expect(insumo1Row.lineage).toEqual([false, true]); // Root was last, Semiterminado was not

        // Row 4: Insumo (Child of Root)
        expect(insumo2Row.level).toBe(1);
        expect(insumo2Row.isLast).toBe(true); // Is the last child of the product
        expect(insumo2Row.lineage).toEqual([false]); // Its parent (root) was the last child
    });
});

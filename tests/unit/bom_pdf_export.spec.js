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

    test('should separate display data from metadata', () => {
        // --- ARRANGE ---
        const flattenedData = getFlattenedData(appState.sinopticoTabularState.selectedProduct, new Set());

        // --- ACT ---
        const result = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById);

        // --- ASSERT ---
        // 1. Check the overall structure
        expect(result).toHaveProperty('body');
        expect(result).toHaveProperty('rawData');

        // 2. Check Body and rawData length
        const { body, rawData } = result;
        expect(body).toBeInstanceOf(Array);
        expect(body).toHaveLength(4);
        expect(rawData).toBeInstanceOf(Array);
        expect(rawData).toHaveLength(4);

        // 3. Check the DISPLAY data (body) - should only contain strings for the PDF
        const [productoBody, semiBody, insumo1Body, insumo2Body] = body;

        // Row 1: Producto
        expect(productoBody.level).toBe('0');
        expect(productoBody.descripcion).toBe('Producto de Prueba');
        expect(productoBody.version).toBe('1.0');
        expect(productoBody.proceso).toBe('Ensamblaje Final');
        expect(productoBody.cantidad).toBe('1');
        expect(productoBody).not.toHaveProperty('isLast'); // Metadata should be gone

        // Row 2: Semiterminado
        expect(semiBody.level).toBe('1');
        expect(semiBody.descripcion).toBe('Semiterminado Principal');
        expect(semiBody.cantidad).toBe('2');
        expect(semiBody.proceso).toBe('Mecanizado CNC');

        // Row 3: Insumo 1
        expect(insumo1Body.level).toBe('2');
        expect(insumo1Body.descripcion).toBe('Insumo A');
        expect(insumo1Body.cantidad).toBe('5');
        expect(insumo1Body.unidad).toBe('kg');
        expect(insumo1Body.comentarios).toBe('Comentario de prueba');

        // Row 4: Insumo 2
        expect(insumo2Body.level).toBe('1');
        expect(insumo2Body.descripcion).toBe('Insumo B');
        expect(insumo2Body.cantidad).toBe('10');
        expect(insumo2Body.unidad).toBe('m');

        // 4. Check the METADATA (rawData) - should contain the raw values for drawing
        const [productoRaw, semiRaw, insumo1Raw, insumo2Raw] = rawData;

        // Row 1: Producto (Root)
        expect(productoRaw.level).toBe(0);
        expect(productoRaw.isLast).toBe(true);
        expect(productoRaw.lineage).toEqual([]);

        // Row 2: Semiterminado (Child of Root)
        expect(semiRaw.level).toBe(1);
        expect(semiRaw.isLast).toBe(false);
        expect(semiRaw.lineage).toEqual([false]);

        // Row 3: Insumo (Child of Semiterminado)
        expect(insumo1Raw.level).toBe(2);
        expect(insumo1Raw.isLast).toBe(true);
        expect(insumo1Raw.lineage).toEqual([false, true]);

        // Row 4: Insumo (Child of Root)
        expect(insumo2Raw.level).toBe(1);
        expect(insumo2Raw.isLast).toBe(true);
        expect(insumo2Raw.lineage).toEqual([false]);
    });
});

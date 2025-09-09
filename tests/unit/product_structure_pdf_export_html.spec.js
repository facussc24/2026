import { describe, test, expect, beforeEach } from '@jest/globals';
import { generateProductStructureReportHTML } from '../../public/utils.js';
import { COLLECTIONS } from '../../public/utils.js';

describe('generateProductStructureReportHTML', () => {
    let mockProduct;
    let mockFlattenedData;
    let mockLogoBase64;
    let mockCollectionsById;

    beforeEach(() => {
        mockProduct = {
            id: 'PROD-TEST',
            descripcion: 'Producto de Prueba',
            version: '1.0',
            clienteId: 'CLIENTE-A',
            proyectoId: 'PROY-A',
            createdAt: { seconds: new Date().getTime() / 1000 },
            fechaRevision: '2023-10-26',
            lastUpdatedBy: 'Jules',
            aprobadoPor: 'Manager'
        };

        mockCollectionsById = {
            [COLLECTIONS.CLIENTES]: new Map([['CLIENTE-A', { id: 'CLIENTE-A', descripcion: 'Cliente de Prueba Corp' }]]),
            [COLLECTIONS.PROYECTOS]: new Map([['PROY-A', { id: 'PROY-A', nombre: 'Proyecto de Prueba' }]]),
        };

        mockFlattenedData = [
            {
                node: { id: 'node-0', refId: 'PROD-TEST', tipo: 'producto', quantity: 1 },
                item: { id: 'PROD-TEST', descripcion: 'Producto de Prueba' },
                level: 0, isLast: true, lineage: []
            },
            {
                node: { id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado', quantity: 2 },
                item: { id: 'SEMI-01', descripcion: 'Sub-ensamble A' },
                level: 1, isLast: false, lineage: [false]
            },
            {
                node: { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', quantity: 5, comment: 'Comentario de prueba' },
                item: { id: 'INSUMO-01', descripcion: 'Pieza X' },
                level: 2, isLast: true, lineage: [true, false]
            }
        ];

        mockLogoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    });

    test('should generate a valid HTML report string', () => {
        // --- ACT ---
        const resultHTML = generateProductStructureReportHTML(mockProduct, mockFlattenedData, mockLogoBase64, mockCollectionsById);

        // --- ASSERT ---
        // 1. Check for basic HTML structure
        expect(resultHTML).toContain('<div style="padding: 15mm; font-family: sans-serif; color: #333;">');
        expect(resultHTML).toContain('<table style="width: 100%; border-collapse: collapse; font-size: 8px;">');
        expect(resultHTML).toContain('<thead>');
        expect(resultHTML).toContain('<tbody>');

        // 2. Check header content
        expect(resultHTML).toContain('<h1 style="font-size: 22px; font-weight: bold; margin: 0; color: #1e40af;">Composición de Piezas</h1>');
        expect(resultHTML).toContain(`<p style="font-size: 14px; margin: 0;">${mockProduct.descripcion}</p>`);
        expect(resultHTML).toContain(`<strong>Nº de Pieza:</strong> ${mockProduct.id}`);
        expect(resultHTML).toContain(`<strong>Cliente:</strong> ${mockCollectionsById[COLLECTIONS.CLIENTES].get('CLIENTE-A').descripcion}`);
        expect(resultHTML).toContain(`<img src="${mockLogoBase64}" style="height: 40px;">`);

        // 3. Check table content
        // It should generate one row for each item in flattenedData
        const rowCount = (resultHTML.match(/<tr/g) || []).length;
        expect(rowCount).toBe(mockFlattenedData.length + 1); // +1 for the header row

        // 4. Check specific row content and tree prefixes
        expect(resultHTML).toContain('>Producto de Prueba</td>'); // Level 0 has no prefix

        // Level 1: isLast is false, so it should start with a connector
        expect(resultHTML).toContain('├─ Sub-ensamble A</td>');

        // Level 2: isLast is true, so it should start with an end-connector
        expect(resultHTML).toContain('└─ Pieza X</td>');

        // Also check the full prefix for the nested item to verify lineage
        expect(resultHTML).toContain('│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ Pieza X</td>');

        // 5. Check a comment
        expect(resultHTML).toContain('>Comentario de prueba</td>');
    });

    test('should handle data with missing optional fields gracefully', () => {
        // --- ARRANGE ---
        const partialProduct = {
            id: 'PROD-PARTIAL',
            descripcion: 'Producto Parcial',
            clienteId: 'CLIENTE-A',
        };
        const partialCollections = {
            [COLLECTIONS.CLIENTES]: new Map([['CLIENTE-A', { id: 'CLIENTE-A', descripcion: 'Cliente Corp' }]]),
            [COLLECTIONS.PROYECTOS]: new Map(),
        }
        const partialData = [
            {
                node: { id: 'node-p0', refId: 'PROD-PARTIAL', tipo: 'producto' },
                item: { id: 'PROD-PARTIAL', descripcion: 'Producto Parcial' },
                level: 0, isLast: true, lineage: []
            }
        ];

        // --- ACT ---
        const resultHTML = generateProductStructureReportHTML(partialProduct, partialData, null, partialCollections);

        // --- ASSERT ---
        expect(resultHTML).toContain('<strong>Versión:</strong> undefined'); // It should render 'undefined' or 'N/A' not crash
        expect(resultHTML).toContain('<strong>Proyecto:</strong> N/A');
        expect(resultHTML).not.toContain('<img'); // No logo
    });
});

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { prepareDataForPdfAutoTable } from '../../public/utils.js';
import { getFlattenedData, exportSinopticoTabularToPdf, appState, dom } from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

describe('BOM PDF Export', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        // 1. Mock the DOM elements that main.js expects to exist
        document.body.innerHTML = `
            <div id="toast-container"></div>
            <div id="loading-overlay" style="display: none;"><p></p></div>
        `;
        // 2. Re-assign the properties of the imported dom object
        dom.toastContainer = document.getElementById('toast-container');
        dom.loadingOverlay = document.getElementById('loading-overlay');

        // 3. Mock global fetch for getLogoBase64
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(['dummy logo data'], { type: 'image/png' })),
            })
        );

        // 4. Manually mock the global jspdf object
        const mockLine = jest.fn();
        const mockAutoTable = jest.fn();
        const mockSave = jest.fn();
        const mockSetFont = jest.fn();
        const mockSetFontSize = jest.fn();
        const mockSetTextColor = jest.fn();
        const mockText = jest.fn();
        const mockAddImage = jest.fn();
        const mockSetProperties = jest.fn();
        const mockSetDrawColor = jest.fn();
        const mockSetLineWidth = jest.fn();

        const mockJsPDFInstance = {
            line: mockLine,
            autoTable: mockAutoTable,
            save: mockSave,
            setFont: mockSetFont,
            setFontSize: mockSetFontSize,
            setTextColor: mockSetTextColor,
            text: mockText,
            addImage: mockAddImage,
            setProperties: mockSetProperties,
            setDrawColor: mockSetDrawColor,
            setLineWidth: mockSetLineWidth,
            internal: {
                pageSize: {
                    getWidth: () => 297,
                    getHeight: () => 210
                }
            }
        };

        const mockJsPDFConstructor = jest.fn(() => mockJsPDFInstance);

        global.window.jspdf = {
            jsPDF: mockJsPDFConstructor
        };

        // 4. Mock the global lucide object, used for toast icons
        global.window.lucide = {
            createIcons: jest.fn()
        };

        // 5. Mock the global appState required by the functions
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
            [COLLECTIONS.CLIENTES]: new Map([
                ['CLIENTE-A', { id: 'CLIENTE-A', descripcion: 'Cliente de Prueba' }]
            ])
        };

        // Mock the state for getFlattenedData and PDF export
        appState.sinopticoTabularState = {
            selectedProduct: mockProduct,
            activeFilters: {
                niveles: new Set()
            },
            flattenedData: getFlattenedData(mockProduct, new Set())
        };
    });

    describe('prepareDataForPdfAutoTable', () => {
        test('should separate display data from metadata', () => {
            // --- ARRANGE ---
            const flattenedData = getFlattenedData(appState.sinopticoTabularState.selectedProduct, new Set());

            // --- ACT ---
            const result = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById);

            // --- ASSERT ---
            expect(result).toHaveProperty('body');
            expect(result).toHaveProperty('rawData');
            const { body, rawData } = result;
            expect(body).toHaveLength(4);
            expect(rawData).toHaveLength(4);

            const [productoBody, semiBody, insumo1Body, insumo2Body] = body;
            expect(productoBody.level).toBe('0');
            expect(semiBody.level).toBe('1');
            expect(insumo1Body.level).toBe('2');
            expect(insumo2Body.level).toBe('1');

            const [productoRaw, semiRaw, insumo1Raw, insumo2Raw] = rawData;
            expect(productoRaw.level).toBe(0);
            expect(semiRaw.level).toBe(1);
            expect(insumo1Raw.level).toBe(2);
            expect(insumo2Raw.level).toBe(1);
        });
    });

    describe('exportSinopticoTabularToPdf', () => {
        test('should call drawing hooks to create a visual tree', async () => {
            // --- ARRANGE ---
            // Mock is set up in beforeEach

            // --- ACT ---
            await exportSinopticoTabularToPdf();

            // --- ASSERT ---
            // 1. Check that a jsPDF instance was created and autoTable was called
            expect(window.jspdf.jsPDF).toHaveBeenCalledTimes(1);
            const mockPdfInstance = window.jspdf.jsPDF.mock.results[0].value;
            const mockAutoTable = mockPdfInstance.autoTable;
            expect(mockAutoTable).toHaveBeenCalledTimes(1);

            // 2. Extract the options object passed to autoTable
            const autoTableOptions = mockAutoTable.mock.calls[0][0];
            expect(autoTableOptions).toHaveProperty('didDrawCell');

            // 3. Simulate the didDrawCell hook calls to test the drawing logic
            const didDrawCell = autoTableOptions.didDrawCell;
            const mockLine = mockPdfInstance.line;

            const { rawData } = prepareDataForPdfAutoTable(appState.sinopticoTabularState.flattenedData, appState.collectionsById);

            // Simulate drawing for the semiterminado (level 1)
            didDrawCell({
                section: 'body',
                column: { dataKey: 'descripcion' },
                row: { index: 1 }, // index of the semiterminado
                cell: { x: 10, y: 60, height: 10 }
            });

            // Simulate drawing for the first insumo (level 2)
            didDrawCell({
                section: 'body',
                column: { dataKey: 'descripcion' },
                row: { index: 2 },
                cell: { x: 10, y: 70, height: 10 }
            });

            expect(mockLine).toHaveBeenCalled();
            expect(mockLine.mock.calls.length).toBeGreaterThan(3);
        });
    });
});

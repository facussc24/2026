import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { runSinopticoTabularLogic, appState, dom } from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

// Store original objects to restore them later
const originalDom = { ...dom };
const originalLucide = global.lucide;

describe('Sinoptico Tabular Level Display Bug', () => {

    beforeEach(() => {
        // Mock the DOM and other global dependencies for the test environment.
        // We replace the parts of the DOM that the function interacts with.
        global.lucide = { createIcons: jest.fn() };
        dom.viewContent = {
            innerHTML: '',
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            // Mock querySelector to return a mock container for the table
            querySelector: jest.fn(selector => {
                if (selector === '#sinoptico-tabular-container') {
                    // This is where the table HTML will be rendered
                    return { innerHTML: '' };
                }
                // Return a generic mock for other selectors to prevent errors
                return {
                    addEventListener: jest.fn(),
                    classList: { toggle: jest.fn(), add: jest.fn() },
                    querySelectorAll: jest.fn(() => [])
                };
            })
        };
        // Mock the container for the header/caratula
        global.document = {
            getElementById: jest.fn(id => ({
                innerHTML: '',
                style: {},
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
            })),
        };

        // Reset appState for test isolation
        appState.collectionsById = {};
        appState.sinopticoTabularState = null;
    });

    afterEach(() => {
        // Restore original objects after each test
        Object.assign(dom, originalDom);
        global.lucide = originalLucide;
        jest.restoreAllMocks();
    });

    test('[BUG] should display the visual level (1) not the original level (2) after filtering', () => {
        // --- ARRANGE ---
        const mockProduct = {
            docId: 'PROD-01',
            id: 'PROD-01',
            descripcion: 'Producto Principal',
            clienteId: 'CLIENTE-A',
            estructura: [
                { // originalLevel: 0
                    id: 'node-0', refId: 'PROD-01', tipo: 'producto',
                    children: [
                        { // originalLevel: 1 (will be filtered out)
                            id: 'node-1', refId: 'SEMI-01', tipo: 'semiterminado',
                            children: [
                                { id: 'node-2', refId: 'INSUMO-01', tipo: 'insumo', children: [] } // originalLevel: 2
                            ]
                        }
                    ]
                }
            ]
        };

        // Mock the necessary collections data for the function to look up item details
        appState.collectionsById = {
            [COLLECTIONS.PRODUCTOS]: new Map([['PROD-01', { id: 'PROD-01', descripcion: 'Producto Principal' }]]),
            [COLLECTIONS.SEMITERMINADOS]: new Map([['SEMI-01', { id: 'SEMI-01', descripcion: 'Semiterminado Nivel 1' }]]),
            [COLLECTIONS.INSUMOS]: new Map([['INSUMO-01', { id: 'INSUMO-01', descripcion: 'Insumo Nivel 2' }]]),
            [COLLECTIONS.CLIENTES]: new Map([['CLIENTE-A', {id: 'CLIENTE-A', descripcion: 'Cliente A'}]]),
            [COLLECTIONS.PROVEEDORES]: new Map(),
            [COLLECTIONS.UNIDADES]: new Map(),
            [COLLECTIONS.PROCESOS]: new Map(),
            [COLLECTIONS.PROYECTOS]: new Map(),
        };

        // Set up the state for the tabular view, including the filter
        appState.sinopticoTabularState = {
            selectedProduct: mockProduct,
            activeFilters: {
                niveles: new Set(['0', '2']) // Filter to show only levels 0 and 2
            }
        };

        // --- ACT ---
        // Run the logic. It will generate the HTML and place it in our mocked `dom` object.
        runSinopticoTabularLogic();

        // --- ASSERT ---
        // The HTML output is now in our mocked `dom.viewContent.innerHTML`.
        const htmlOutput = dom.viewContent.innerHTML;

        const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/;
        const tableMatch = htmlOutput.match(tableRegex);
        expect(tableMatch).not.toBeNull();
        const tableHtml = tableMatch[1];

        const insumoRowRegex = /<tr[^>]*data-node-id="node-2"[^>]*>([\s\S]*?)<\/tr>/;
        const insumoRowMatch = tableHtml.match(insumoRowRegex);
        expect(insumoRowMatch).not.toBeNull();

        const insumoRowHtml = insumoRowMatch[1];
        const cellContentRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        const cellMatches = [...insumoRowHtml.matchAll(cellContentRegex)];
        const cellContents = cellMatches.map(match => match[1]);

        // The "Nivel" column is the second column (index 1).
        const nivelCellContent = cellContents[1];

        // The buggy code would output '2' (from node.originalLevel).
        // We assert that the output is '1' (the correct visual level).
        // This test will FAIL with the original code, and PASS with my fix.
        expect(nivelCellContent.trim()).toBe('1');
    });
});

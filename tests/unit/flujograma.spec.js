/**
 * @jest-environment jsdom
 */

// Mock para appState y sus colecciones
const appState = {
    collectionsById: {
        productos: new Map([
            ['PROD-01', { id: 'PROD-01', descripcion: 'Producto Principal' }]
        ]),
        semiterminados: new Map([
            ['SEMI-01', { id: 'SEMI-01', descripcion: 'Componente Semi-terminado' }]
        ]),
        insumos: new Map([
            ['INS-01', { id: 'INS-01', descripcion: 'Insumo A' }],
            ['INS-02', { id: 'INS-02', descripcion: 'Insumo B' }]
        ])
    }
};

// Mock de funciones de main.js (si es necesario)
const generateFlowchartHTML = (nodes) => {
    const generateNodeHTML = (node) => {
        const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
        if (!item) return '';

        const childrenHTML = node.children && node.children.length > 0
            ? `<div class="flujograma-children">${generateFlowchartHTML(node.children)}</div>`
            : '';

        return `
            <div class="flujograma-node-container">
                <div class="flujograma-node ${node.tipo}" data-testid="node-${item.id}">
                    <div class="flujograma-node-text">
                        <h4>${item.descripcion}</h4>
                        <p>${node.tipo} - ${item.id}</p>
                    </div>
                </div>
                ${childrenHTML}
            </div>
        `;
    };

    if (!nodes || nodes.length === 0) return '';
    return `<div class="flujograma-level">${nodes.map(generateNodeHTML).join('')}</div>`;
};


describe('Generación de Flujograma de Procesos', () => {
    it('Debería transformar una estructura de producto simple en el HTML correcto del flujograma', () => {
        const sampleStructure = [
            {
                id: 'node-1',
                refId: 'PROD-01',
                tipo: 'producto',
                children: [
                    {
                        id: 'node-2',
                        refId: 'SEMI-01',
                        tipo: 'semiterminado',
                        children: [
                            { id: 'node-3', refId: 'INS-01', tipo: 'insumo', children: [] }
                        ]
                    },
                    {
                        id: 'node-4',
                        refId: 'INS-02',
                        tipo: 'insumo',
                        children: []
                    }
                ]
            }
        ];

        const resultHTML = generateFlowchartHTML(sampleStructure);
        document.body.innerHTML = resultHTML;

        // Verificar el nodo raíz (Producto)
        expect(document.querySelector('[data-testid="node-PROD-01"]')).not.toBeNull();
        expect(document.querySelector('[data-testid="node-PROD-01"] h4').textContent).toBe('Producto Principal');

        // Verificar el nodo semiterminado
        expect(document.querySelector('[data-testid="node-SEMI-01"]')).not.toBeNull();
        expect(document.querySelector('[data-testid="node-SEMI-01"] h4').textContent).toBe('Componente Semi-terminado');

        // Verificar los insumos
        expect(document.querySelector('[data-testid="node-INS-01"]')).not.toBeNull();
        expect(document.querySelector('[data-testid="node-INS-01"] h4').textContent).toBe('Insumo A');
        expect(document.querySelector('[data-testid="node-INS-02"]')).not.toBeNull();
        expect(document.querySelector('[data-testid="node-INS-02"] h4').textContent).toBe('Insumo B');

        // Verificar la estructura de niveles
        const levels = document.querySelectorAll('.flujograma-level');
        expect(levels.length).toBe(3); // 3 niveles en el flujograma

        // Verificar la anidación
        const productNode = document.querySelector('[data-testid="node-PROD-01"]').closest('.flujograma-node-container');
        const semiTerminadoNode = productNode.querySelector('[data-testid="node-SEMI-01"]');
        expect(semiTerminadoNode).not.toBeNull();

        const insumoNode1 = semiTerminadoNode.closest('.flujograma-node-container').querySelector('[data-testid="node-INS-01"]');
        expect(insumoNode1).not.toBeNull();
    });
});

/**
 * @jest-environment jsdom
 */


import { appState } from '../../public/state.js';

// Copia de la función a probar desde main.js
const generateMermaidDefinition = (nodes) => {
    if (!nodes || nodes.length === 0) return 'graph TD; A["Estructura Vacía"];';

    let definition = 'graph TD;\n';
    definition += '    classDef producto fill:#e0f2fe,stroke:#3b82f6,stroke-width:2px,font-weight:bold;\n';
    definition += '    classDef semiterminado fill:#dcfce7,stroke:#16a34a,stroke-width:2px;\n';
    definition += '    classDef insumo fill:#f1f5f9,stroke:#64748b,stroke-width:2px;\n\n';

    const nodeDefinitions = new Set();
    const connections = [];

    function traverse(node, parentId) {
        const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
        if (!item) return;

        // Define el nodo si no ha sido definido antes
        if (!nodeDefinitions.has(node.id)) {
            const nodeLabel = `${item.descripcion}<br><small>(${item.id})</small>`;
            nodeDefinitions.add(node.id);
            definition += `    ${node.id}("${nodeLabel}"):::${node.tipo};\n`;
        }

        // Añade la conexión desde el padre
        if (parentId) {
            connections.push(`    ${parentId} --> ${node.id};`);
        }

        // Recorre los hijos
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => traverse(child, node.id));
        }
    }

    nodes.forEach(rootNode => traverse(rootNode, null));

    definition += '\n' + connections.join('\n');
    return definition;
};

describe('Generación de Flujograma de Procesos con Mermaid', () => {
    it('Debería transformar una estructura de producto simple en la sintaxis correcta de Mermaid', () => {
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

        const resultMermaid = generateMermaidDefinition(sampleStructure);

        // Verificar la cabecera y las definiciones de clase
        expect(resultMermaid).toContain('graph TD;');
        expect(resultMermaid).toContain('classDef producto');
        expect(resultMermaid).toContain('classDef semiterminado');
        expect(resultMermaid).toContain('classDef insumo');

        // Verificar las definiciones de nodos
        expect(resultMermaid).toContain('node-1("Producto Principal<br><small>(PROD-01)</small>"):::producto;');
        expect(resultMermaid).toContain('node-2("Componente Semi-terminado<br><small>(SEMI-01)</small>"):::semiterminado;');
        expect(resultMermaid).toContain('node-3("Insumo A<br><small>(INS-01)</small>"):::insumo;');
        expect(resultMermaid).toContain('node-4("Insumo B<br><small>(INS-02)</small>"):::insumo;');

        // Verificar las conexiones
        expect(resultMermaid).toContain('node-1 --> node-2;');
        expect(resultMermaid).toContain('node-1 --> node-4;');
        expect(resultMermaid).toContain('node-2 --> node-3;');
    });

    it('Debería manejar una estructura vacía', () => {
        const resultMermaid = generateMermaidDefinition([]);
        expect(resultMermaid).toBe('graph TD; A["Estructura Vacía"];');
    });
});

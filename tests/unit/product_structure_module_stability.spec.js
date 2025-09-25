import { jest, describe, test, expect, beforeEach } from '@jest/globals';

jest.mock('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import * as mainModule from '../../public/main.js';
import { COLLECTIONS } from '../../public/utils.js';

const {
    handleProductSelect,
    handleDropEvent,
    appState,
    dom,
} = mainModule;

describe('Product structure module stability', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        document.body.innerHTML = '';

        const viewContent = document.createElement('div');
        viewContent.id = 'view-content';
        document.body.appendChild(viewContent);
        dom.viewContent = viewContent;

        const toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
        dom.toastContainer = toastContainer;

        const modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
        dom.modalContainer = modalContainer;

        appState.currentData = [];
        appState.collections[COLLECTIONS.PRODUCTOS] = [];
        appState.collections[COLLECTIONS.CLIENTES] = [];
        appState.collectionsById[COLLECTIONS.PRODUCTOS] = new Map();
        appState.collectionsById[COLLECTIONS.SEMITERMINADOS] = new Map();
        appState.collectionsById[COLLECTIONS.INSUMOS] = new Map();
        appState.arbolActivo = null;

        global.Sortable = class {
            constructor(element) {
                element.sortable = { destroy: jest.fn() };
            }
        };
    });

    test('handleProductSelect accepts Firestore document ids', async () => {
        const productDocId = 'doc-123';
        const productBusinessId = 'PROD-001';
        const productData = {
            id: productBusinessId,
            descripcion: 'Producto de prueba',
            estructura: [
                {
                    id: 'root-node',
                    refId: productBusinessId,
                    tipo: 'producto',
                    icon: 'package',
                    children: [],
                }
            ],
        };

        appState.collections[COLLECTIONS.PRODUCTOS] = [{
            id: productBusinessId,
            descripcion: 'Producto de prueba',
            docId: productDocId,
        }];
        doc.mockImplementation((_, __, id) => ({ id, path: `${COLLECTIONS.PRODUCTOS}/${id}` }));
        getDoc.mockResolvedValueOnce({
            exists: () => true,
            id: productDocId,
            data: () => productData,
        });

        const showToastSpy = jest.spyOn(mainModule, 'showToast');

        await handleProductSelect(productDocId);

        expect(doc).toHaveBeenCalled();
        const [_dbArg, collectionArg, docIdArg] = doc.mock.calls[0];
        expect(collectionArg).toBe(COLLECTIONS.PRODUCTOS);
        expect(docIdArg).toBe(productDocId);
        expect(getDoc).toHaveBeenCalledTimes(1);
        expect(appState.arbolActivo).not.toBeNull();
        expect(appState.arbolActivo.docId).toBe(productDocId);
        expect(appState.arbolActivo.productoPrincipalId).toBe(productBusinessId);
        const errorToast = showToastSpy.mock.calls.find(([, type]) => type === 'error');
        expect(errorToast).toBeUndefined();

        showToastSpy.mockRestore();
    });

    test('handleDropEvent prevents dropping nodes into the root level', () => {
        const productBusinessId = 'PROD-001';
        const childId = 'child-1';

        appState.arbolActivo = {
            nombre: 'Árbol de prueba',
            clienteId: null,
            estructura: [
                {
                    id: 'root-node',
                    refId: productBusinessId,
                    tipo: 'producto',
                    icon: 'package',
                    children: [
                        {
                            id: childId,
                            refId: 'SEMI-1',
                            tipo: 'semiterminado',
                            icon: 'box',
                            children: [],
                            quantity: 1,
                            comment: '',
                        }
                    ],
                }
            ],
        };

        appState.collections[COLLECTIONS.CLIENTES] = [];
        const originalChild = appState.arbolActivo.estructura[0].children[0];
        const evt = {
            item: { dataset: { nodeId: childId } },
            to: { closest: () => null },
            newIndex: 0,
            oldIndex: 0,
        };

        handleDropEvent(evt);

        expect(appState.arbolActivo.estructura[0].children).toHaveLength(1);
        expect(appState.arbolActivo.estructura[0].children[0].id).toBe(childId);
        expect(appState.arbolActivo.estructura[0].children[0]).toBe(originalChild);
    });
});

import { showToast, showPromptModal } from '../shared/ui.js';
import { COLLECTIONS, flattenEstructura, getLogoBase64, ensureCollectionsAreLoaded, prepareDataForPdfAutoTable } from '../../utils.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, runTransaction, orderBy, limit, startAfter, or, getCountFromServer } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const noop = () => {};

let productDependencies = {
    appState: {
        collectionsById: {},
        collections: {},
        currentData: [],
        sinopticoTabularState: null,
    },
    db: null,
    dom: null,
    lucide: { createIcons: noop },
    renderArbol: noop,
    renderArbolDetalle: noop,
    renderArbolesInitialView: noop,
    crearComponente: () => ({ children: [] }),
    findNode: noop,
    showToast,
    checkUserPermission: () => false,
    ensureCollectionsAreLoaded,
    openSinopticoEditModal: noop,
    handleCaratulaClick: noop,
};

export function initProductLogic(overrides = {}) {
    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            productDependencies[key] = value;
        }
    }
}

/**
 * Deletes a main product and any of its sub-components that would be left orphaned by the deletion.
 * An orphan is a sub-component that is not used by any other product.
 * @param {string} productDocId - The document ID of the main product to delete.
 * @param {object} db - The Firestore database instance.
 * @param {object} firestore - An object containing Firestore functions like { doc, getDoc, getDocs, deleteDoc, collection, query, where }.
 * @param {object} COLLECTIONS - An object mapping collection names to their string values.
 * @param {object} uiCallbacks - An object with UI functions like { showToast, runTableLogic }.
 */
export async function deleteProductAndOrphanedSubProducts(productDocId, db, firestore, COLLECTIONS, uiCallbacks) {
    // Destructure the required firestore functions from the passed-in object
    const { doc, getDoc, getDocs, deleteDoc, collection, query, where } = firestore;
    const { showToast, runTableLogic } = uiCallbacks;

    showToast('Iniciando eliminación de producto y componentes...', 'info');
    try {
        const productRef = doc(db, COLLECTIONS.PRODUCTOS, productDocId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            showToast('El producto ya no existe.', 'info');
            runTableLogic();
            return;
        }

        const productData = productSnap.data();
        const subComponentRefs = new Map(); // Use a Map to store type and ID

        function findSubComponents(nodes) {
            if (!nodes) return;
            for (const node of nodes) {
                if (node.tipo === 'semiterminado' || node.tipo === 'insumo') {
                    // Store the type along with the ID
                    if (!subComponentRefs.has(node.refId)) {
                        subComponentRefs.set(node.refId, node.tipo);
                    }
                }
                if (node.children) {
                    findSubComponents(node.children);
                }
            }
        }

        findSubComponents(productData.estructura);

        // --- REFACTORED LOGIC ---
        // Step 1: Identify and delete orphans first for safety.
        if (subComponentRefs.size > 0) {
            showToast(`Verificando ${subComponentRefs.size} sub-componentes...`, 'info');
            let deletedCount = 0;
            const productsRef = collection(db, COLLECTIONS.PRODUCTOS);

            for (const [subComponentId, subComponentType] of subComponentRefs.entries()) {
                const q = query(
                    productsRef,
                    where('component_ids', 'array-contains', subComponentId),
                    limit(2)
                );
                const usageSnap = await getDocs(q);

                // An orphan is a component whose only user is the product being deleted.
                // So, if usage count is 1 (or 0), it's an orphan.
                const otherUsers = usageSnap.docs.filter(d => d.id !== productDocId);

                if (otherUsers.length === 0) {
                    const collectionName = subComponentType === 'insumo' ? COLLECTIONS.INSUMOS : COLLECTIONS.SEMITERMINADOS;
                    const subProductDocRef = doc(db, collectionName, subComponentId);
                    const subProductDocSnap = await getDoc(subProductDocRef);
                    if (subProductDocSnap.exists()) {
                        await deleteDoc(subProductDocRef);
                        deletedCount++;
                    }
                }
            }

            if (deletedCount > 0) {
                showToast(`${deletedCount} sub-componentes huérfanos eliminados.`, 'success');
            } else {
                showToast('No se eliminaron sub-componentes (están en uso por otros productos).', 'info');
            }
        } else {
            showToast('El producto no tenía sub-componentes para verificar.', 'info');
        }

        // Step 2: Now, safely delete the main product.
        await deleteDoc(productRef);
        showToast('Producto principal eliminado.', 'success');

        runTableLogic();

    } catch (error) {
        console.error("Error deleting product and orphaned sub-products:", error);
        showToast('Ocurrió un error durante la eliminación compleja.', 'error');
        // Re-throw the error to allow the calling context to handle it.
        throw error;
    }
}

let regenerateNodeIdsCounter = 0;

export function regenerateNodeIds(nodes) {
    if (!nodes) return;
    regenerateNodeIdsCounter++;
    const prefix = `comp_${Date.now()}_${regenerateNodeIdsCounter}`;
    let nodeCounter = 0;
    function processNodes(nodeArray) {
        nodeArray.forEach(node => {
            node.id = `${prefix}_${nodeCounter++}`;
            if (node.children) {
                processNodes(node.children);
            }
        });
    }
    processNodes(nodes);
}

export async function cloneProduct(dependencies, product = null) {
    const { db, firestore, ui, appState } = dependencies;
    const { query, collection, where, getDocs, addDoc } = firestore;
    const { showToast, showPromptModal } = ui;
    const productToClone = product || appState.sinopticoTabularState?.selectedProduct;
    if (!productToClone) {
        showToast('No hay un producto seleccionado para clonar.', 'error');
        return;
    }
    const newId = await showPromptModal('Clonar Producto', `Ingrese el nuevo código para el clon de "${productToClone.id}":`);
    if (!newId) return;
    const q = query(collection(db, COLLECTIONS.PRODUCTOS), where("id", "==", newId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        showToast(`El código de producto "${newId}" ya existe.`, 'error');
        return;
    }
    showToast('Clonando producto...', 'info');
    const newProduct = JSON.parse(JSON.stringify(productToClone));
    delete newProduct.docId;
    delete newProduct.lastUpdated;
    delete newProduct.lastUpdatedBy;
    delete newProduct.reviewedBy;
    delete newProduct.fecha_modificacion;
    delete newProduct.createdAt;
    delete newProduct.fechaRevision;
    delete newProduct.aprobadoPor;
    newProduct.id = newId;
    newProduct.codigo_pieza = newId;
    newProduct.createdAt = new Date();
    newProduct.fecha_modificacion = new Date();
    if (newProduct.estructura) {
        regenerateNodeIds(newProduct.estructura);
        if (newProduct.estructura[0] && newProduct.estructura[0].tipo === 'producto') {
            newProduct.estructura[0].refId = newId;
        }
        newProduct.component_ids = flattenEstructura(newProduct.estructura);
    }
    try {
        await addDoc(collection(db, COLLECTIONS.PRODUCTOS), newProduct);
        showToast(`Producto "${productToClone.descripcion}" clonado exitosamente como "${newId}".`, 'success');
    } catch (error) {
        console.error("Error clonando el producto:", error);
        showToast('Ocurrió un error al clonar el producto.', 'error');
    }
}

export const getFlattenedData = (product, activeFilters = {}) => {
    const appState = productDependencies.appState;
    if (!product || !product.estructura || !appState) return [];
    let niveles, material;
    if (activeFilters instanceof Set) {
        niveles = activeFilters;
        material = null;
    } else {
        ({ niveles, material } = activeFilters || {});
    }
    const materialLower = material ? String(material).toLowerCase().trim() : null;
    const hasLevelFilter = !!(niveles && niveles.size > 0);
    const hasMaterialFilter = !!materialLower;
    if (niveles && niveles.size === 0) {
        return [];
    }
    const hasFilters = hasLevelFilter || hasMaterialFilter;
    const recordOriginalLevels = (nodes, level) => {
        if (!nodes) return;
        nodes.forEach(node => {
            node.originalLevel = level;
            if (node.children) {
                recordOriginalLevels(node.children, level + 1);
            }
        });
    };
    recordOriginalLevels(product.estructura, 0);
    if (!hasFilters) {
        return (function simpleFlatten(nodes, level, lineage) {
            let list = [];
            if (!nodes) return list;
            nodes.forEach((node, index) => {
                const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
                if (!item) return;
                const isLast = index === nodes.length - 1;
                list.push({ node, item, level, isLast, lineage });
                if (node.children) {
                    list = list.concat(simpleFlatten(node.children, level + 1, [...lineage, !isLast]));
                }
            });
            return list;
        })(product.estructura, 0, []);
    }
    const results = [];
    const shouldKeepNode = (node) => {
        const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
        if (!item) return false;
        const selfMatchesLevel = !hasLevelFilter || niveles.has(String(node.originalLevel));
        let selfMatchesMaterial = true;
        if (hasMaterialFilter) {
            let materialText = '';
            if (node.tipo === 'semiterminado') selfMatchesMaterial = (item.materiales_componentes || '').toLowerCase().includes(materialLower);
            else if (node.tipo === 'insumo') selfMatchesMaterial = (item.material || '').toLowerCase().includes(materialLower);
            else selfMatchesMaterial = false;
        }
        if (selfMatchesLevel && selfMatchesMaterial) return true;
        return (node.children || []).some(shouldKeepNode);
    };
    function process(nodes, visualLevel, lineage) {
        if (!nodes) return;
        nodes.forEach((node, index) => {
            const isLast = index === nodes.length - 1;
            if (!shouldKeepNode(node)) {
                return;
            }
            const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
            if (!item) return;
            const selfMatchesLevel = !hasLevelFilter || niveles.has(String(node.originalLevel));
            const selfMatchesMaterial = !hasMaterialFilter || (
                (node.tipo === 'semiterminado' && (item.materiales_componentes || '').toLowerCase().includes(materialLower)) ||
                (node.tipo === 'insumo' && (item.material || '').toLowerCase().includes(materialLower))
            );
            if (selfMatchesLevel && selfMatchesMaterial) {
                results.push({
                    node,
                    item,
                    level: visualLevel,
                    isLast,
                    lineage,
                });
                process(node.children, visualLevel + 1, [...lineage, !isLast]);
            } else {
                process(node.children, visualLevel, [...lineage, !isLast]);
            }
        });
    }
    process(product.estructura, 0, []);
    return results;
};

export function handleDropEvent(evt) {
    const appState = productDependencies.appState;
    const renderArbol = productDependencies.renderArbol || noop;
    const findNode = productDependencies.findNode || noop;
    const toast = productDependencies.showToast || showToast;

    if (!appState?.arbolActivo || !evt?.item?.dataset) {
        renderArbol();
        return;
    }
    const movedItemId = evt.item.dataset.nodeId;
    const newParentEl = evt.to;
    const parentListItem = newParentEl.closest('li[data-node-id]');
    const newParentId = parentListItem ? parentListItem.dataset.nodeId : null;
    const newIndex = evt.newIndex;
    let movedNode = null;
    let oldParentNode = null;
    function findAndRemove(nodes, parent) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === movedItemId) {
                movedNode = nodes.splice(i, 1)[0];
                oldParentNode = parent;
                return true;
            }
            if (nodes[i].children && findAndRemove(nodes[i].children, nodes[i])) {
                return true;
            }
        }
        return false;
    }
    findAndRemove(appState.arbolActivo.estructura, null);
    if (!movedNode) {
        renderArbol();
        return;
    }
    const restoreNode = () => {
        const targetArray = oldParentNode ? oldParentNode.children : appState.arbolActivo.estructura;
        const originalIndex = typeof evt.oldIndex === 'number' ? evt.oldIndex : targetArray.length;
        targetArray.splice(originalIndex, 0, movedNode);
    };
    if (!newParentId) {
        restoreNode();
        toast('No se puede mover este componente al nivel raíz.', 'error');
        renderArbol();
        return;
    }
    const newParentNode = findNode(newParentId, appState.arbolActivo.estructura);
    if (!newParentNode) {
        restoreNode();
        toast('No se pudo encontrar el nodo de destino.', 'error');
        renderArbol();
        return;
    }
    if (newParentNode.tipo === 'insumo') {
        restoreNode();
        toast('No se puede anidar un componente dentro de un insumo.', 'error');
        renderArbol();
        return;
    }
    if (!newParentNode.children) newParentNode.children = [];
    newParentNode.children.splice(newIndex, 0, movedNode);
    renderArbol();
}

export async function handleProductSelect(productIdentifier) {
    const appState = productDependencies.appState;
    const dbInstance = productDependencies.db;
    const renderArbolDetalle = productDependencies.renderArbolDetalle || noop;
    const renderArbolesInitialView = productDependencies.renderArbolesInitialView || noop;
    const crearComponente = productDependencies.crearComponente || (() => ({ children: [] }));
    const toast = productDependencies.showToast || showToast;

    if (!appState) {
        return;
    }
    const matchProduct = (producto, identifier) =>
        producto && (producto.id === identifier || producto.docId === identifier);
    let producto = appState.currentData.find(p => matchProduct(p, productIdentifier));
    if (!producto && Array.isArray(appState.collections[COLLECTIONS.PRODUCTOS])) {
        producto = appState.collections[COLLECTIONS.PRODUCTOS].find(p => matchProduct(p, productIdentifier));
    }
    let documentId = producto?.docId || null;
    let preloadedSnapshot = null;
    try {
        if (!documentId) {
            const potentialRef = doc(dbInstance, COLLECTIONS.PRODUCTOS, productIdentifier);
            const potentialSnap = await getDoc(potentialRef);
            if (potentialSnap.exists()) {
                documentId = potentialSnap.id;
                preloadedSnapshot = potentialSnap;
                producto = { ...potentialSnap.data(), docId: potentialSnap.id };
            }
        }
        if (!documentId) {
            toast("Error: Producto no encontrado.", "error");
            return;
        }
        const productoRef = doc(dbInstance, COLLECTIONS.PRODUCTOS, documentId);
        const productoSnap = preloadedSnapshot || await getDoc(productoRef);
        if (!productoSnap.exists()) {
            toast("Error: El documento del producto ya no existe.", "error");
            return;
        }
        let productoData = productoSnap.data();
        if (!productoData.estructura || productoData.estructura.length === 0) {
            const nuevaEstructura = [crearComponente('producto', productoData)];
            await updateDoc(productoRef, { estructura: nuevaEstructura });
            productoData.estructura = nuevaEstructura;
            toast(`Nueva estructura de árbol creada para ${productoData.descripcion}.`, 'success');
        }
        appState.arbolActivo = {
            ...productoData,
            docId: productoSnap.id,
            nombre: `Árbol de ${productoData.descripcion}`,
            productoPrincipalId: productoData.id || producto?.id || productIdentifier
        };
        renderArbolDetalle();
    } catch (error) {
        console.error("Error al seleccionar el producto y cargar su estructura:", error);
        toast(error.message || "Ocurrió un error al cargar el árbol del producto.", 'error');
        renderArbolesInitialView();
    }
}

function renderTabularTable(data) {
    const state = productDependencies.appState?.sinopticoTabularState;
    const selectedProduct = state?.selectedProduct;

    if (!data || data.length === 0) return `<p class="text-slate-500 p-4 text-center">La estructura de este producto está vacía o los filtros no arrojaron resultados.</p>`;

    const headers = [
        "Nivel", "Descripción", "Version", "Part Number", "Image", "Pieces/Vh [u.]", "Process", "LC Site / KD", "Aspect", "Material",
        "Total Weight (Calculated) [g]", "Color", "Raw Material", "Raw Material Supplier", "Net Consumption",
        "Consumption with Scrap", "UoM (Unit of Measure)", "Comments", "Acciones"
    ];

    let tableHTML = `<table class="w-full text-sm text-left text-gray-600 modern-bom-table">`;
    tableHTML += `<thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>`;
    headers.forEach(h => tableHTML += `<th scope="col" class="px-4 py-3 align-middle whitespace-nowrap">${h}</th>`);
    tableHTML += `</tr></thead><tbody>`;

    data.forEach(rowData => {
        const { node, item, level, isLast, lineage } = rowData;
        const NA = '<span class="text-slate-400">-</span>';

        let prefix = (lineage || []).map(parentIsNotLast => parentIsNotLast ? '│&nbsp;&nbsp;&nbsp;&nbsp;' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;').join('');
        if (level > 0)  prefix += isLast ? '└─ ' : '├─ ';

        const descripcion = `<span class="font-mono font-medium">${prefix}</span><span class="font-semibold">${item.descripcion || item.nombre || ''}</span>`;
        const nivel = node.originalLevel;
        const version = item.version || NA;
        const partNumber = item.codigo_pieza || NA;
        const image = item.imagen ? `<img src="${item.imagen}" class="h-10 w-10 object-cover rounded-md border" alt="Component image">` : NA;

        const piecesPerVh = selectedProduct?.piezas_por_vehiculo ?? NA;
        const color = selectedProduct?.color ?? NA;

        let proceso = NA;
        if (item.proceso) {
            const procesoData = productDependencies.appState?.collectionsById?.[COLLECTIONS.PROCESOS]?.get(item.proceso);
            proceso = procesoData ? procesoData.descripcion : item.proceso;
        }

        const lcKd = item.lc_kd || NA;
        const aspecto = item.aspecto || NA;

        let material = NA;
        if (node.tipo === 'producto' && selectedProduct?.material_separar) {
            material = 'Ver sub-componentes';
        } else if (node.tipo === 'semiterminado') {
            material = item.materiales_componentes || NA;
        } else if (node.tipo === 'insumo') {
            material = item.material || NA;
        }

        const weight = item.peso_gr || NA;

        let rawMaterial = NA;
        let rawMaterialSupplier = NA;
        let netConsumption = NA;
        let consumptionWithScrap = NA;
        let uom = NA;

        if (node.tipo === 'insumo') {
            rawMaterial = item.codigo_materia_prima || NA;
            if (item.proveedor_materia_prima) {
                const provMP = productDependencies.appState?.collectionsById?.[COLLECTIONS.PROVEEDORES]?.get(item.proveedor_materia_prima);
                rawMaterialSupplier = provMP ? provMP.descripcion : item.proveedor_materia_prima;
            }
            netConsumption = node.consumoTeorico ?? NA;
            consumptionWithScrap = node.consumoReal ?? NA;
            if (item.unidad_medida) {
                const unidadData = productDependencies.appState?.collectionsById?.[COLLECTIONS.UNIDADES]?.get(item.unidad_medida);
                uom = unidadData ? unidadData.id : item.unidad_medida;
            }
        }

        const comments = node.comment || NA;
        const actionsHTML = (productDependencies.checkUserPermission || (() => false))('edit') ? `<button data-action="edit-tabular-node" data-node-id="${node.id}" class="p-1 text-blue-600 hover:bg-blue-100 rounded-md" title="Editar"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>` : '';

        tableHTML += `<tr class="bg-white border-b hover:bg-gray-100" data-node-id="${node.id}">
            <td class="px-4 py-2 text-center align-middle">${nivel}</td>
            <td class="px-4 py-2 align-middle" style="min-width: 300px;">${descripcion}</td>
            <td class="px-4 py-2 text-center align-middle">${version}</td>
            <td class="px-4 py-2 text-center align-middle">${partNumber}</td>
            <td class="px-4 py-2 text-center align-middle">${image}</td>
            <td class="px-4 py-2 text-center align-middle">${piecesPerVh}</td>
            <td class="px-4 py-2 text-center align-middle">${proceso}</td>
            <td class="px-4 py-2 text-center align-middle">${lcKd}</td>
            <td class="px-4 py-2 text-center align-middle">${aspecto}</td>
            <td class="px-4 py-2 text-center align-middle">${material}</td>
            <td class="px-4 py-2 text-right align-middle">${weight}</td>
            <td class="px-4 py-2 text-center align-middle">${color}</td>
            <td class="px-4 py-2 text-center align-middle">${rawMaterial}</td>
            <td class="px-4 py-2 text-center align-middle">${rawMaterialSupplier}</td>
            <td class="px-4 py-2 text-right align-middle">${netConsumption}</td>
            <td class="px-4 py-2 text-right align-middle">${consumptionWithScrap}</td>
            <td class="px-4 py-2 text-center align-middle">${uom}</td>
            <td class="px-4 py-2 align-middle" style="min-width: 150px;">${comments}</td>
            <td class="px-4 py-2 text-center align-middle">${actionsHTML}</td>
        </tr>`;
    });
    tableHTML += `</tbody></table>`;
    return tableHTML;
}

export function runSinopticoTabularLogic() {
    const appState = productDependencies.appState;
    const dom = productDependencies.dom;
    const lucide = productDependencies.lucide || { createIcons: noop };
    const toast = productDependencies.showToast || showToast;
    const ensureCollections = productDependencies.ensureCollectionsAreLoaded || ensureCollectionsAreLoaded;
    const openSinopticoEditModal = productDependencies.openSinopticoEditModal || noop;
    const handleCaratulaClick = productDependencies.handleCaratulaClick || noop;
    const dbInstance = productDependencies.db;

    if (!appState || !dom?.viewContent) {
        return;
    }

    if (!appState.sinopticoTabularState) {
        appState.sinopticoTabularState = {
            selectedProduct: null,
            activeFilters: {
                niveles: new Set(),
                material: ''
            }
        };
    }

    const state = appState.sinopticoTabularState;
    if (!(state.activeFilters.niveles instanceof Set)) {
        state.activeFilters.niveles = new Set(state.activeFilters.niveles ? [...state.activeFilters.niveles] : []);
    }
    state.activeFilters.material = state.activeFilters.material || '';

    const renderReportView = () => {
        const product = state.selectedProduct;
        if (!product) {
            renderInitialView();
            return;
        }

        const headerHTML = `
            <div class="report-header bg-white p-4 mb-4 rounded-lg shadow-md border flex justify-between items-center">
                <div class="flex items-center gap-4">
                    <img src="/barack_logo.png" alt="Logo" class="h-12">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">PART COMPOSITION - BOM</h2>
                        <p class="text-sm text-slate-500">${product.descripcion || ''}</p>
                    </div>
                </div>
                <div class="text-sm text-slate-600 grid grid-cols-2 gap-x-4 gap-y-1">
                    <strong class="text-right">Issue Date:</strong>
                    <input type="date" value="${new Date().toISOString().split('T')[0]}" class="p-1 border rounded-md bg-white">

                    <strong class="text-right">Prepared by:</strong>
                    <span>${appState.currentUser?.name || 'N/A'}</span>

                    <strong class="text-right">Version:</strong>
                    <span>${product.version || '1.0'}</span>
                </div>
            </div>
        `;

        const getOriginalMaxDepth = (nodes, level = 0) => {
            if (!nodes || nodes.length === 0) return level > 0 ? level - 1 : 0;
            let max = level;
            for (const node of nodes) {
                const depth = getOriginalMaxDepth(node.children, level + 1);
                if (depth > max) max = depth;
            }
            return max;
        };

        const flattenedData = getFlattenedData(product, state.activeFilters);
        const tableHTML = renderTabularTable(flattenedData);

        const maxLevel = getOriginalMaxDepth(product.estructura);
        let levelFilterOptionsHTML = '';
        for (let i = 0; i <= maxLevel; i++) {
            const isChecked = state.activeFilters.niveles.size === 0 || state.activeFilters.niveles.has(i.toString());
            levelFilterOptionsHTML += `
                <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-md cursor-pointer">
                    <input type="checkbox" data-level="${i}" class="level-filter-cb h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isChecked ? 'checked' : ''}>
                    <span class="text-sm">Nivel ${i}</span>
                </label>
            `;
        }

        dom.viewContent.innerHTML = `<div class="animate-fade-in-up">
            ${headerHTML}
            <div class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div><h3 class="text-xl font-bold text-slate-800">Detalle de: ${product.descripcion}</h3><p class="text-sm text-slate-500">${product.id}</p></div>
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <button id="level-filter-btn" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-50 flex items-center gap-2">
                                <i data-lucide="filter" class="h-4 w-4"></i>Filtrar por Nivel<i data-lucide="chevron-down" class="h-4 w-4 ml-1"></i>
                            </button>
                            <div id="level-filter-dropdown" class="absolute z-10 right-0 mt-2 w-48 bg-white border rounded-lg shadow-xl hidden p-2 dropdown-menu">
                                ${levelFilterOptionsHTML}
                                <div class="border-t my-2"></div>
                                <button data-action="apply-tabular-filters" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Aplicar</button>
                            </div>
                        </div>
                        <div class="border-l pl-2 flex items-center gap-2">
                             <input type="text" id="material-filter-input" placeholder="Buscar por material..." class="border-slate-300 rounded-md shadow-sm text-sm p-2">
                             <button data-action="apply-tabular-filters" class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700">Buscar</button>
                        </div>
                        <button data-action="select-another-product-tabular" class="bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600 flex items-center">
                            <i data-lucide="search" class="mr-2 h-4 w-4"></i>Seleccionar Otro
                        </button>
                        <button data-action="export-sinoptico-tabular-pdf" class="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-red-700 flex items-center">
                            <i data-lucide="file-text" class="mr-2 h-4 w-4"></i>Exportar a PDF
                        </button>
                    </div>
                </div>
                <div id="sinoptico-tabular-container" class="mt-6 overflow-x-auto">${tableHTML}</div>
            </div>
        </div>`;

        lucide.createIcons();
    };

    const handleViewClick = async (e) => {
        const button = e.target.closest('button[data-action]');

        if (e.target.closest('#level-filter-btn')) {
            const dropdown = document.getElementById('level-filter-dropdown');
            if (dropdown) dropdown.classList.toggle('hidden');
            return;
        }

        if (!button) return;

        const action = button.dataset.action;

        switch (action) {
            case 'open-product-search-modal-tabular':
                await openProductSearchModal();
                break;
            case 'select-another-product-tabular':
                state.selectedProduct = null;
                state.activeFilters.niveles.clear();
                renderInitialView();
                break;
            case 'edit-tabular-node':
                openSinopticoEditModal(button.dataset.nodeId);
                break;
            case 'apply-tabular-filters':
                const levelDropdown = document.getElementById('level-filter-dropdown');
                const selectedLevels = new Set();
                if (levelDropdown) {
                    levelDropdown.querySelectorAll('.level-filter-cb:checked').forEach(cb => {
                        selectedLevels.add(cb.dataset.level);
                    });
                    const allLevelsCount = levelDropdown.querySelectorAll('.level-filter-cb').length;
                    if (allLevelsCount > 0 && selectedLevels.size === allLevelsCount) {
                        state.activeFilters.niveles.clear();
                    } else {
                        state.activeFilters.niveles = selectedLevels;
                    }
                    levelDropdown.classList.add('hidden');
                }

                const materialInput = document.getElementById('material-filter-input');
                state.activeFilters.material = materialInput ? materialInput.value : '';

                const tableContainer = document.getElementById('sinoptico-tabular-container');
                if (tableContainer) {
                    const savedScrollY = window.scrollY;
                    tableContainer.innerHTML = `<div class="flex items-center justify-center p-16 text-slate-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mr-3"></i><span>Aplicando filtros...</span></div>`;
                    lucide.createIcons();

                    const processDataPromise = new Promise(resolve => {
                        const product = state.selectedProduct;
                        const flattenedData = getFlattenedData(product, state.activeFilters);
                        const newTableHTML = renderTabularTable(flattenedData);
                        resolve(newTableHTML);
                    });

                    Promise.all([new Promise(res => setTimeout(res, 300)), processDataPromise]).then(([_, newTableHTML]) => {
                        tableContainer.innerHTML = newTableHTML;
                        lucide.createIcons();
                        window.scrollTo(0, savedScrollY);
                    });
                }
                break;
            case 'export-sinoptico-tabular-pdf':
                exportSinopticoTabularToPdf();
                break;
        }
    };

    const openProductSearchModal = async () => {
        try {
            await ensureCollections([COLLECTIONS.CLIENTES, COLLECTIONS.PRODUCTOS]);
        } catch (error) {
            toast('Error al cargar datos para la búsqueda. Intente de nuevo.', 'error');
            return;
        }

        if (!appState.collections?.[COLLECTIONS.CLIENTES] || !appState.collections?.[COLLECTIONS.PRODUCTOS]) {
            toast('Error: No se pudieron cargar los datos necesarios. Por favor, recargue la página.', 'error');
            return;
        }

        let clientOptions = '<option value="">Todos</option>' + appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
        const modalId = `prod-search-modal-tabular-${Date.now()}`;
        const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Buscar Producto Principal</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"><div><label for="search-prod-term" class="block text-sm font-medium">Código/Descripción</label><input type="text" id="search-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm"></div><div><label for="search-prod-client" class="block text-sm font-medium">Cliente</label><select id="search-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select></div></div><div id="search-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;

        if (!dom?.modalContainer) return;
        dom.modalContainer.innerHTML = modalHTML;
        const modalElement = document.getElementById(modalId);
        const termInput = modalElement?.querySelector('#search-prod-term');
        const clientSelect = modalElement?.querySelector('#search-prod-client');
        const resultsContainer = modalElement?.querySelector('#search-prod-results');

        if (!termInput || !clientSelect || !resultsContainer) return;

        const searchHandler = () => {
            const term = termInput.value.toLowerCase();
            const clientId = clientSelect.value;
            const products = appState.collections[COLLECTIONS.PRODUCTOS] || [];
            let results = products.filter(p => (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) && (!clientId || p.clienteId === clientId));
            resultsContainer.innerHTML = results.length === 0 ? `<p class="text-center py-8">No se encontraron productos.</p>` : `<div class="space-y-1">${results.map(p => `<button data-product-id="${p.id}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center"><p class="font-semibold text-blue-800">${p.descripcion} (${p.id})</p><p class="text-xs text-gray-500">${appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === p.clienteId)?.descripcion || ''}</p></button>`).join('')}</div>`;
        };

        termInput.addEventListener('input', searchHandler);
        clientSelect.addEventListener('change', searchHandler);
        resultsContainer.addEventListener('click', e => {
            const button = e.target.closest('button[data-product-id]');
            if (button) {
                handleTabularProductSelect(button.dataset.productId);
                modalElement.remove();
            }
        });
        modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
        searchHandler();
        lucide.createIcons();
    };

    const handleTabularProductSelect = async (productId) => {
        try {
            const productRef = doc(dbInstance, COLLECTIONS.PRODUCTOS, productId);
            const productDoc = await getDoc(productRef);

            if (productDoc.exists()) {
                const producto = { ...productDoc.data(), docId: productDoc.id };
                state.selectedProduct = producto;

                const products = appState.collections[COLLECTIONS.PRODUCTOS] || [];
                const productIndex = products.findIndex(p => p.id === productId);
                if (productIndex !== -1) {
                    products[productIndex] = producto;
                } else {
                    products.push(producto);
                }

                state.activeFilters.niveles = new Set();
                renderReportView();
            } else {
                toast("Error: Producto no encontrado en la base de datos.", "error");
                renderInitialView();
            }
        } catch (error) {
            console.error("Error loading data for tabular report:", error);
            toast('Error al cargar los datos necesarios para el reporte.', 'error');
            renderInitialView();
        }
    };

    const renderInitialView = () => {
        dom.viewContent.innerHTML = `<div class="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-lg p-6 text-center animate-fade-in-up">
            <i data-lucide="file-search-2" class="h-24 w-24 text-gray-300 mb-6"></i>
            <h3 class="text-2xl font-bold">Reporte de Estructura de Producto (Tabular)</h3>
            <p class="text-gray-500 mt-2 mb-8 max-w-lg">Para comenzar, busque y seleccione el producto principal que desea consultar.</p>
            <button data-action="open-product-search-modal-tabular" class="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold shadow-lg transition-transform transform hover:scale-105">
                <i data-lucide="search" class="inline-block mr-2 -mt-1"></i>Seleccionar Producto
            </button>
        </div>`;
        lucide.createIcons();
    };

    if (state.selectedProduct) {
        renderReportView();
    } else {
        renderInitialView();
    }

    dom.viewContent.addEventListener('click', handleViewClick);
    dom.viewContent.addEventListener('click', handleCaratulaClick);

    appState.currentViewCleanup = () => {
        dom.viewContent.removeEventListener('click', handleViewClick);
        dom.viewContent.removeEventListener('click', handleCaratulaClick);
        appState.sinopticoTabularState = null;
    };

    runSinopticoTabularLogic.renderReportView = renderReportView;
    runSinopticoTabularLogic.renderInitialView = renderInitialView;
}

export async function exportSinopticoTabularToPdf() {
    const appState = productDependencies.appState;
    const dom = productDependencies.dom;
    const toast = productDependencies.showToast || showToast;

    const state = appState?.sinopticoTabularState;
    if (!state || !state.selectedProduct) {
        toast('No hay producto seleccionado para exportar.', 'error');
        return;
    }
    const product = state.selectedProduct;
    const client = appState.collectionsById?.[COLLECTIONS.CLIENTES]?.get(product.clienteId);

    toast('Generando PDF de estructura...', 'info');
    if (dom?.loadingOverlay) {
        dom.loadingOverlay.style.display = 'flex';
        const loadingText = dom.loadingOverlay.querySelector('p');
        if (loadingText) loadingText.textContent = 'Procesando datos...';
    }

    try {
        const jsPdfModule = window.jspdf;
        if (!jsPdfModule?.jsPDF) {
            throw new Error('jsPDF no está disponible');
        }
        const { jsPDF } = jsPdfModule;
        const docInstance = new jsPDF('l', 'mm', 'a4');
        const logoBase64 = await getLogoBase64();

        const addPageNumbers = () => {
            const pageCount = docInstance.internal.getNumberOfPages();
            docInstance.setFont('helvetica', 'normal');
            docInstance.setFontSize(8);
            docInstance.setTextColor(150);
            for (let i = 1; i <= pageCount; i++) {
                docInstance.setPage(i);
                const text = `Página ${i} de ${pageCount}`;
                const textWidth = docInstance.getStringUnitWidth(text) * docInstance.internal.getFontSize() / docInstance.internal.scaleFactor;
                docInstance.text(text, docInstance.internal.pageSize.width - 15 - textWidth, docInstance.internal.pageSize.height - 10);

                const generatedText = `Generado el ${new Date().toLocaleDateString('es-AR')} por ${appState.currentUser?.name || 'N/A'}`;
                docInstance.text(generatedText, 15, docInstance.internal.pageSize.height - 10);
            }
        };

        if (logoBase64) {
            docInstance.addImage(logoBase64, 'PNG', docInstance.internal.pageSize.width / 2 - 30, 40, 60, 25);
        }
        docInstance.setFontSize(28);
        docInstance.setFont('helvetica', 'bold');
        docInstance.text('Reporte de Estructura de Producto', docInstance.internal.pageSize.width / 2, 90, { align: 'center' });

        docInstance.setFontSize(16);
        docInstance.setFont('helvetica', 'normal');
        docInstance.text(`Producto: ${product.descripcion}`, docInstance.internal.pageSize.width / 2, 120, { align: 'center' });
        docInstance.text(`Código: ${product.id}`, docInstance.internal.pageSize.width / 2, 128, { align: 'center' });
        docInstance.text(`Cliente: ${client?.descripcion || 'N/A'}`, docInstance.internal.pageSize.width / 2, 136, { align: 'center' });

        docInstance.addPage();
        if (dom?.loadingOverlay) {
            const loadingText = dom.loadingOverlay.querySelector('p');
            if (loadingText) loadingText.textContent = 'Generando tabla...';
        }

        const flattenedData = getFlattenedData(product, state.activeFilters);
        const { head, body: bodyObjects } = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById, product);

        const columnOrder = ['descripcion', 'nivel', 'codigo', 'cantidad', 'comentarios'];
        const bodyAsArrays = bodyObjects.map(obj => columnOrder.map(key => obj[key] !== undefined ? obj[key] : ''));

        docInstance.autoTable({
            head,
            body: bodyAsArrays,
            startY: 20,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 1.5,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [41, 104, 217],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { cellWidth: 60 },
                1: { cellWidth: 10, halign: 'center' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 20, halign: 'center' },
                4: { cellWidth: 15, halign: 'center' },
            },
            didDrawPage: () => {
                if (logoBase64) {
                    docInstance.addImage(logoBase64, 'PNG', 15, 8, 20, 8);
                }
                docInstance.setFontSize(12);
                docInstance.setFont('helvetica', 'bold');
                docInstance.text('Estructura de Producto', docInstance.internal.pageSize.width - 15, 15, { align: 'right' });
            }
        });

        addPageNumbers();
        docInstance.save(`Estructura_${product.id}.pdf`);
        toast('PDF generado con éxito.', 'success');

    } catch (error) {
        console.error("Error al generar PDF con jsPDF:", error);
        toast(`Error al generar el PDF: ${error.message}`, 'error');
    } finally {
        if (dom?.loadingOverlay) {
            dom.loadingOverlay.style.display = 'none';
        }
    }
}

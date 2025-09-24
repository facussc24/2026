import { showToast, showPromptModal } from '../shared/ui.js';
import { COLLECTIONS, flattenEstructura } from '/utils.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, runTransaction, orderBy, limit, startAfter, or, getCountFromServer } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
    if (!product || !product.estructura) return [];
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
    if (!appState.arbolActivo || !evt?.item?.dataset) {
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
        showToast('No se puede mover este componente al nivel raíz.', 'error');
        renderArbol();
        return;
    }
    const newParentNode = findNode(newParentId, appState.arbolActivo.estructura);
    if (!newParentNode) {
        restoreNode();
        showToast('No se pudo encontrar el nodo de destino.', 'error');
        renderArbol();
        return;
    }
    if (newParentNode.tipo === 'insumo') {
        restoreNode();
        showToast('No se puede anidar un componente dentro de un insumo.', 'error');
        renderArbol();
        return;
    }
    if (!newParentNode.children) newParentNode.children = [];
    newParentNode.children.splice(newIndex, 0, movedNode);
    renderArbol();
}

export async function handleProductSelect(productIdentifier) {
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
            const potentialRef = doc(db, COLLECTIONS.PRODUCTOS, productIdentifier);
            const potentialSnap = await getDoc(potentialRef);
            if (potentialSnap.exists()) {
                documentId = potentialSnap.id;
                preloadedSnapshot = potentialSnap;
                producto = { ...potentialSnap.data(), docId: potentialSnap.id };
            }
        }
        if (!documentId) {
            showToast("Error: Producto no encontrado.", "error");
            return;
        }
        const productoRef = doc(db, COLLECTIONS.PRODUCTOS, documentId);
        const productoSnap = preloadedSnapshot || await getDoc(productoRef);
        if (!productoSnap.exists()) {
            showToast("Error: El documento del producto ya no existe.", "error");
            return;
        }
        let productoData = productoSnap.data();
        if (!productoData.estructura || productoData.estructura.length === 0) {
            const nuevaEstructura = [crearComponente('producto', productoData)];
            await updateDoc(productoRef, { estructura: nuevaEstructura });
            productoData.estructura = nuevaEstructura;
            showToast(`Nueva estructura de árbol creada para ${productoData.descripcion}.`, 'success');
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
        showToast(error.message || "Ocurrió un error al cargar el árbol del producto.", 'error');
        renderArbolesInitialView();
    }
}

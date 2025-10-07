/**
 * Product maintenance services.
 *
 * Houses shared helpers that operate on product documents, including the logic
 * required to delete a product and cascade clean up orphaned sub-components.
 *
 * @module services/product.service
 */

import { limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Deletes a product document and any orphaned sub-components that are only referenced by it.
 * @param {string} productDocId - The Firestore document ID of the product to delete.
 * @param {import('firebase/firestore').Firestore} db - The Firestore database instance.
 * @param {Object} firestore - Collection of Firestore helpers (doc, getDoc, deleteDoc, etc.).
 * @param {typeof import('../utils.js').COLLECTIONS} COLLECTIONS - Map of collection names.
 * @param {{ showToast: Function, runTableLogic: Function }} uiCallbacks - UI helpers for notifications and refreshes.
 * @returns {Promise<void>}
 */
export async function deleteProductAndOrphanedSubProducts(productDocId, db, firestore, COLLECTIONS, uiCallbacks) {
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
        const subComponentRefs = new Map();

        function findSubComponents(nodes) {
            if (!nodes) return;
            for (const node of nodes) {
                if (node.tipo === 'semiterminado' || node.tipo === 'insumo') {
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

                const otherUsers = usageSnap.docs.filter(d => d.id !== productDocId);

                if (otherUsers.length === 0) {
                    const collectionName = subComponentType === 'insumo'
                        ? COLLECTIONS.INSUMOS
                        : COLLECTIONS.SEMITERMINADOS;
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

        await deleteDoc(productRef);
        showToast('Producto principal eliminado.', 'success');

        runTableLogic();
    } catch (error) {
        console.error("Error deleting product and orphaned sub-products:", error);
        showToast('Ocurrió un error durante la eliminación compleja.', 'error');
        throw error;
    }
}

// Import only the functions that are truly needed at the module level.
import { limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getUniqueKeyForCollection } from './utils.js';


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
/**
 * @file Contains core data manipulation and business logic functions for the application.
 * These functions often interact directly with the Firestore database and manage complex state changes.
 */

import { getUniqueKeyForCollection } from './utils.js';

/**
 * Deletes a main product and then identifies and deletes any of its "semiterminado" sub-components
 * that have become "orphaned" (i.e., are no longer used in any other existing product).
 * This function is critical for maintaining data integrity when products are removed.
 *
 * @async
 * @param {string} productDocId - The document ID of the main product to be deleted.
 * @param {object} db - The Firestore database instance.
 * @param {object} firestore - An object containing destructured Firestore functions like `doc`, `getDoc`, etc.
 * @param {object} COLLECTIONS - The application's collection name constants.
 * @param {object} uiCallbacks - An object containing callback functions for UI updates.
 * @param {Function} uiCallbacks.showToast - A function to display toast notifications to the user.
 * @param {Function} uiCallbacks.runTableLogic - A function to refresh the main data table view.
 * @returns {Promise<void>} A promise that resolves when the entire deletion process is complete.
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
            return;
        }

        const productData = productSnap.data();
        const subProductRefs = new Set();

        // Recursively finds all unique sub-product references within a product's structure.
        function findSubProducts(nodes) {
            if (!nodes) return;
            for (const node of nodes) {
                if (node.tipo === 'semiterminado') {
                    subProductRefs.add(node.refId);
                }
                if (node.children) {
                    findSubProducts(node.children);
                }
            }
        }

        findSubProducts(productData.estructura);

        // Delete the main product
        await deleteDoc(productRef);
        showToast('Producto principal eliminado.', 'success');

        if (subProductRefs.size === 0) {
            showToast('El producto no tenía sub-componentes para verificar.', 'info');
            runTableLogic();
            return;
        }

        showToast(`Verificando ${subProductRefs.size} sub-componentes...`, 'info');

        // Get all other products to check for dependencies.
        const allProductsSnap = await getDocs(collection(db, COLLECTIONS.PRODUCTOS));
        const allOtherProducts = [];
        allProductsSnap.docs.forEach(doc => {
            if (doc.id !== productDocId) {
                allOtherProducts.push(doc.data());
            }
        });

        let deletedCount = 0;
        // Check each sub-product to see if it's used elsewhere.
        for (const subProductRefId of subProductRefs) {
            let isUsedElsewhere = false;
            for (const otherProduct of allOtherProducts) {
                // Recursively checks if a specific sub-product is used in a given product structure.
                function isSubProductInStructure(nodes) {
                    if (!nodes) return false;
                    for (const node of nodes) {
                        if (node.tipo === 'semiterminado' && node.refId === subProductRefId) {
                            return true;
                        }
                        if (node.children && isSubProductInStructure(node.children)) {
                            return true;
                        }
                    }
                    return false;
                }

                if (isSubProductInStructure(otherProduct.estructura)) {
                    isUsedElsewhere = true;
                    break;
                }
            }

            // If not used anywhere else, delete the orphaned sub-product.
            if (!isUsedElsewhere) {
                const subProductDocRef = doc(db, COLLECTIONS.SEMITERMINADOS, subProductRefId);
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

    } catch (error) {
        console.error("Error deleting product and orphaned sub-products:", error);
        showToast('Ocurrió un error durante la eliminación compleja.', 'error');
    } finally {
        runTableLogic(); // Always refresh the table at the end.
    }
}

/**
 * Registers a department's approval decision for an ECR and updates the ECR's overall status.
 * This function acts as the state machine for the ECR approval workflow.
 * It runs as a Firestore transaction to ensure atomicity.
 *
 * @async
 * @param {string} ecrId - The ID of the ECR document to modify.
 * @param {string} departmentId - The ID of the department making the decision (e.g., 'calidad').
 * @param {string} decision - The decision made ('approved', 'rejected', 'stand-by').
 * @param {string} comment - An optional comment associated with the decision.
 * @param {object} deps - An object containing all necessary dependencies for the function.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - An object with Firestore functions like { runTransaction, doc, getDoc }.
 * @param {object} deps.COLLECTIONS - The application's collection name constants.
 * @param {object} deps.appState - The global application state, including the current user.
 * @param {object} deps.uiCallbacks - An object with UI callback functions like { showToast, sendNotification }.
 * @returns {Promise<void>} A promise that resolves when the approval has been processed.
 */
export async function registerEcrApproval(ecrId, departmentId, decision, comment, deps) {
    const { db, firestore, COLLECTIONS, appState, uiCallbacks } = deps;
    const { runTransaction, doc, getDoc } = firestore;
    const { showToast, sendNotification } = uiCallbacks;

    const user = appState.currentUser;
    if (!user) {
        showToast('Debe iniciar sesión para aprobar.', 'error');
        return;
    }

    if (!ecrId || !departmentId || !decision) {
        showToast('Error: Faltan datos para registrar la aprobación.', 'error');
        return;
    }

    const ecrRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
    let ecrDataBeforeUpdate = null;

    try {
        await runTransaction(db, async (transaction) => {
            const ecrDoc = await transaction.get(ecrRef);
            if (!ecrDoc.exists()) {
                throw new Error("El ECR no existe.");
            }

            const ecrData = ecrDoc.data();
            ecrDataBeforeUpdate = { ...ecrData }; // Store state before change for notification logic

            if (!ecrData.approvals) {
                ecrData.approvals = {};
            }

            // Check for permissions
            if (appState.currentUser.sector !== departmentId && appState.currentUser.role !== 'admin') {
                throw new Error(`No tienes permiso para aprobar por el departamento de ${departmentId}.`);
            }

            // Prepare the approval data
            const approvalPath = `approvals.${departmentId}`;
            const approvalUpdate = {
                status: decision,
                user: user.name,
                date: new Date().toISOString().split('T')[0],
                comment: comment || ''
            };

            const updateData = { [approvalPath]: approvalUpdate };
            ecrData.approvals[departmentId] = approvalUpdate; // Apply update to local copy for evaluation

            // Evaluate the new overall status of the ECR
            let newOverallStatus = ecrData.status;
            if (ecrData.status === 'pending-approval') {
                const allDepartments = [
                    'ing_producto', 'ing_manufatura', 'hse', 'calidad', 'compras',
                    'sqa', 'tooling', 'logistica', 'financiero', 'comercial',
                    'mantenimiento', 'produccion', 'calidad_cliente'
                ];
                const requiredApprovals = allDepartments.filter(dept => ecrData[`afecta_${dept}`] === true);

                if (requiredApprovals.length === 0 && decision === 'approved') {
                    // If no departments are marked as affected, any single approval moves it to 'approved'
                    newOverallStatus = 'approved';
                } else {
                    if (decision === 'rejected') {
                        // A single rejection rejects the whole ECR
                        newOverallStatus = 'rejected';
                    } else {
                        // Check if all required departments have now approved
                        const allApproved = requiredApprovals.every(dept => ecrData.approvals[dept]?.status === 'approved');
                        if (allApproved) {
                            newOverallStatus = 'approved';
                        }
                    }
                }
            }

            if (newOverallStatus !== ecrData.status) {
                updateData.status = newOverallStatus;
            }

            updateData.lastModified = new Date();
            updateData.modifiedBy = user.email;

            // Commit the transaction
            transaction.update(ecrRef, updateData);
        });

        const finalEcrDoc = await getDoc(ecrRef);
        const finalEcrData = finalEcrDoc.data();

        showToast(`Decisión del departamento de ${departmentId} registrada.`, 'success');

        // Send notification if the overall status changed
        if (finalEcrData.status !== ecrDataBeforeUpdate.status) {
            showToast(`El estado del ECR ha cambiado a: ${finalEcrData.status}`, 'info');
            if (finalEcrData.creatorUid) {
                sendNotification(
                    finalEcrData.creatorUid,
                    `El estado del ECR "${ecrId}" ha cambiado a ${finalEcrData.status}.`,
                    'ecr_form',
                    { ecrId: ecrId }
                );
            }
        }

    } catch (error) {
        console.error("Error al registrar la aprobación del ECR:", error);
        showToast(error.message || 'No se pudo registrar la aprobación.', 'error');
    }
}

/**
 * Gathers and formats data from the ECR form element into a plain JavaScript object.
 * This function correctly handles all standard form inputs and ensures that the state
 * of `input[type="checkbox"]` is captured, excluding any that are disabled.
 * @param {HTMLFormElement} formContainer - The form element to process.
 * @returns {object} An object representing the form's current data.
 */
export function getEcrFormData(formContainer) {
    const formData = new FormData(formContainer);
    const dataToSave = Object.fromEntries(formData.entries());

    // FIX: This selector now correctly excludes disabled checkboxes.
    formContainer.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        dataToSave[cb.name] = cb.checked;
    });

    return dataToSave;
}

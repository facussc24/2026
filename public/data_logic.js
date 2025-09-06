// No longer importing from firebase here. The functions will be passed in.

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

        // Delete the main product
        await deleteDoc(productRef);
        showToast('Producto principal eliminado.', 'success');

        if (subComponentRefs.size === 0) {
            showToast('El producto no tenía sub-componentes para verificar.', 'info');
            runTableLogic();
            return;
        }

        showToast(`Verificando ${subComponentRefs.size} sub-componentes...`, 'info');

        const allProductsSnap = await getDocs(collection(db, COLLECTIONS.PRODUCTOS));
        const allOtherProducts = [];
        allProductsSnap.docs.forEach(doc => {
            if (doc.id !== productDocId) {
                allOtherProducts.push(doc.data());
            }
        });

        let deletedCount = 0;
        for (const [subComponentId, subComponentType] of subComponentRefs.entries()) {
            let isUsedElsewhere = false;
            for (const otherProduct of allOtherProducts) {
                function isSubComponentInStructure(nodes) {
                    if (!nodes) return false;
                    for (const node of nodes) {
                        if (node.refId === subComponentId) {
                            return true;
                        }
                        if (node.children && isSubComponentInStructure(node.children)) {
                            return true;
                        }
                    }
                    return false;
                }

                if (isSubComponentInStructure(otherProduct.estructura)) {
                    isUsedElsewhere = true;
                    break;
                }
            }

            if (!isUsedElsewhere) {
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

    } catch (error) {
        console.error("Error deleting product and orphaned sub-products:", error);
        showToast('Ocurrió un error durante la eliminación compleja.', 'error');
    } finally {
        runTableLogic();
    }
}

/**
 * Registra la decisión de un departamento sobre un ECR y evalúa si el estado general del ECR debe cambiar.
 * @param {string} ecrId - El ID del ECR a modificar.
 *param {string} departmentId - El ID del departamento que emite la decisión (ej: 'calidad').
 * @param {string} decision - La decisión tomada ('approved', 'rejected', 'stand-by').
 * @param {string} comment - Un comentario opcional sobre la decisión.
 * @param {object} deps - An object containing all dependencies.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - An object with Firestore functions like { runTransaction, doc, getDoc }.
 * @param {object} deps.COLLECTIONS - The collections map.
 * @param {object} deps.appState - The global application state.
 * @param {object} deps.uiCallbacks - An object with UI functions like { showToast, sendNotification }.
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

            if (appState.currentUser.sector !== departmentId && appState.currentUser.role !== 'admin') {
                throw new Error(`No tienes permiso para aprobar por el departamento de ${departmentId}.`);
            }

            const approvalPath = `approvals.${departmentId}`;
            const approvalUpdate = {
                status: decision,
                user: user.name,
                date: new Date().toISOString().split('T')[0],
                comment: comment || ''
            };

            const updateData = { [approvalPath]: approvalUpdate };
            ecrData.approvals[departmentId] = approvalUpdate; // Apply update to local copy

            // --- Refactored logic ---
            // The `decision` is passed to ensure that a 'rejected' status is applied immediately
            // without needing to check all other departments.
            const newOverallStatus = checkAndUpdateEcrStatus(ecrData, decision);
            if (newOverallStatus && newOverallStatus !== ecrData.status) {
                updateData.status = newOverallStatus;
            }
            // --- End refactored logic ---

            updateData.lastModified = new Date();
            updateData.modifiedBy = user.email;

            transaction.update(ecrRef, updateData);
        });

        const finalEcrDoc = await getDoc(ecrRef);
        const finalEcrData = finalEcrDoc.data();

        showToast(`Decisión del departamento de ${departmentId} registrada.`, 'success');

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
 * Evaluates an ECR's data to determine if its overall status should change.
 * This is pure logic, decoupled from database transactions.
 * @param {object} ecrData - The ECR data object.
 * @param {string} [currentDecision=''] - The current decision being made (e.g., 'approved', 'rejected').
 *                                        Used to immediately reject an ECR.
 * @returns {string|null} - The new status ('approved', 'rejected') or null if no change.
 */
export function checkAndUpdateEcrStatus(ecrData, currentDecision = '') {
    if (ecrData.status !== 'pending-approval') {
        return null; // Don't change status if it's not pending
    }

    // Immediate rejection if the current decision is 'rejected'
    if (currentDecision === 'rejected') {
        return 'rejected';
    }

    const allDepartments = [
        'ing_producto', 'ing_manufatura', 'hse', 'calidad', 'compras',
        'sqa', 'tooling', 'logistica', 'financiero', 'comercial',
        'mantenimiento', 'produccion', 'calidad_cliente'
    ];

    const requiredApprovals = allDepartments.filter(dept => ecrData[`afecta_${dept}`] === true);

    // If there are no required departments, one 'approved' decision is enough to approve the ECR.
    if (requiredApprovals.length === 0) {
        // This handles the edge case where no departments are checked, but a user (e.g., admin) approves.
        return currentDecision === 'approved' ? 'approved' : null;
    }

    // Check if all required departments have approved.
    const allRequiredHaveApproved = requiredApprovals.every(
        dept => ecrData.approvals?.[dept]?.status === 'approved'
    );

    if (allRequiredHaveApproved) {
        return 'approved';
    }

    return null; // No status change required
}

/**
 * Gathers and formats data from the ECR form, ensuring that disabled fields
 * are ignored and the state of all inputs (including unchecked checkboxes) is captured correctly.
 * @param {HTMLFormElement} formContainer - The form element to process.
 * @returns {object} - The processed form data.
 */
export function getEcrFormData(formContainer) {
    const dataToSave = {};

    for (const element of formContainer.elements) {
        // Skip disabled elements, elements without a name, or buttons/irrelevant inputs.
        if (element.disabled || !element.name || element.tagName === 'BUTTON' || element.type === 'submit' || element.type === 'reset') {
            continue;
        }

        switch (element.type) {
            case 'checkbox':
                // For checkboxes, we always store the boolean `checked` state.
                dataToSave[element.name] = element.checked;
                break;
            case 'radio':
                // For radio buttons, only save the value of the selected one.
                if (element.checked) {
                    dataToSave[element.name] = element.value;
                }
                break;
            case 'select-multiple':
                // For multi-select, gather all selected options into an array.
                dataToSave[element.name] = Array.from(element.options)
                    .filter(option => option.selected)
                    .map(option => option.value);
                break;
            default:
                // For all other input types (text, date, select-one, etc.).
                dataToSave[element.name] = element.value;
                break;
        }
    }

    return dataToSave;
}

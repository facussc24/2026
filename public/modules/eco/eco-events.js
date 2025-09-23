/**
 * @file Manages all event listeners for the ECO module.
 */

/**
 * Initializes all event listeners for the ECO views.
 * @param {object} deps - Dependencies object.
 * @param {function} deps.switchView - Function to switch views.
 * @param {function} deps.showConfirmationModal - Function to show a confirmation modal.
 * @param {function} deps.showToast - Function to show toast notifications.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { doc, updateDoc }.
 * @param {object} deps.appState - The global application state.
 * @param {object} deps.logic - An object containing the business logic functions for ECO.
 */
export function initEcoEventListeners(deps) {
    const { switchView, showConfirmationModal, showToast, db, firestore, appState, logic } = deps;
    const { doc, updateDoc } = firestore;

    // This function will be attached to the main content area
    const handleEcoActions = (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const ecoId = button.dataset.id;

        switch (action) {
            case 'view-eco':
                switchView('eco_form', { ecoId: ecoId });
                break;
            case 'view-eco-history':
                logic.showEcoHistoryModal(ecoId, deps);
                break;
            case 'export-eco-pdf':
                logic.exportEcoToPdf(ecoId, deps);
                break;
            case 'approve-eco':
                showConfirmationModal('Aprobar ECO', `¿Está seguro de que desea aprobar el ECO "${ecoId}"? Esta acción es final.`, async () => {
                    const docRef = doc(db, 'eco_forms', ecoId);
                    try {
                        await updateDoc(docRef, { status: 'approved', lastModified: new Date(), modifiedBy: appState.currentUser.email });
                        showToast(`ECO "${ecoId}" aprobado.`, 'success');
                    } catch (error) {
                        console.error("Error approving ECO:", error);
                        showToast('Error al aprobar el ECO.', 'error');
                    }
                });
                break;
        }
    };

    // Return the handler so it can be attached in main.js
    return handleEcoActions;
}

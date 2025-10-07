/**
 * User management module.
 *
 * Encapsulates helpers that power the administrative user management view,
 * including disabling accounts and refreshing the underlying data table. The
 * module relies on dependency injection to avoid tight coupling with the main
 * application shell.
 *
 * @module modules/user_management/index
 */

let appState;
let showToast;
let showConfirmationModal;
let runTableLogic;
let db;
let auth;
let COLLECTIONS;
let updateDocFn;
let docFn;

/**
 * Registers the shared dependencies required for the user management helpers.
 *
 * @param {Object} dependencies - Firebase instances and UI callbacks.
 */
export function initUserManagementModule(dependencies) {
    appState = dependencies.appState;
    showToast = dependencies.showToast;
    showConfirmationModal = dependencies.showConfirmationModal;
    runTableLogic = dependencies.runTableLogic;
    db = dependencies.db;
    auth = dependencies.auth;
    COLLECTIONS = dependencies.COLLECTIONS;
    updateDocFn = dependencies.updateDoc;
    docFn = dependencies.doc;
}

/**
 * Handles the "disable user" action by presenting a confirmation modal and
 * updating the Firestore document if confirmed.
 *
 * @param {string} docId - Firestore document ID of the user to disable.
 * @returns {boolean} True if the action was handled by this module.
 */
export function handleUserDisable(docId) {
    if (!docId || !appState || !COLLECTIONS || !docFn || !updateDocFn) {
        return false;
    }

    const targetUser = appState.currentData?.find?.(d => d.docId === docId);
    if (!targetUser) {
        showToast?.('No se encontró el usuario solicitado.', 'error');
        return true;
    }

    if (auth?.currentUser?.uid && targetUser.docId === auth.currentUser.uid) {
        showToast?.('No puedes deshabilitar tu propia cuenta desde aquí.', 'error');
        return true;
    }

    const itemName = targetUser.name || targetUser.email || 'este usuario';
    showConfirmationModal?.(
        'Deshabilitar Usuario',
        `¿Estás seguro de que deseas deshabilitar a "${itemName}"? El usuario ya no podrá iniciar sesión.`,
        async () => {
            try {
                const userDocRef = docFn(db, COLLECTIONS.USUARIOS, docId);
                await updateDocFn(userDocRef, { disabled: true });
                showToast?.('Usuario deshabilitado con éxito.', 'success');
                runTableLogic?.();
            } catch (error) {
                console.error('Error disabling user: ', error);
                showToast?.('Error al deshabilitar el usuario.', 'error');
            }
        }
    );

    return true;
}

import { doc, updateDoc, addDoc, deleteDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { showToast } from './ui.js';
import { getUniqueKeyForCollection, COLLECTIONS } from '../../utils.js';

let db;

export function initFirestoreHelpers(dependencies) {
    db = dependencies.db;
}

export async function saveDocument(collectionName, data, docId = null) {
    const toastId = showToast('Guardando...', 'loading', { duration: 0 }); // Show loading toast that doesn't auto-hide

    try {
        if (docId) {
            // Logic for updating an existing document
            if (collectionName === COLLECTIONS.PRODUCTOS) {
                data.fecha_modificacion = new Date();
            }
            const docRef = doc(db, collectionName, docId);
            await updateDoc(docRef, data);
            showToast('Registro actualizado con éxito.', 'success', { toastId });
        } else {
            // Logic for creating a new document
            if (collectionName === COLLECTIONS.PRODUCTOS) {
                data.createdAt = new Date();
                data.fecha_modificacion = new Date();
            }
            const uniqueKeyField = getUniqueKeyForCollection(collectionName);
            const uniqueKeyValue = data[uniqueKeyField];

            if (!uniqueKeyValue) {
                throw new Error(`Error: El campo de identificación único '${uniqueKeyField}' está vacío.`);
            }

            data.id = uniqueKeyValue;
            const docRef = doc(db, collectionName, uniqueKeyValue);

            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (docSnap.exists()) {
                    // By throwing an error, the transaction is automatically aborted.
                    throw new Error(`El valor "${uniqueKeyValue}" para el campo "${uniqueKeyField}" ya existe.`);
                }
                transaction.set(docRef, data);
            });

            showToast('Registro creado con éxito.', 'success', { toastId });
        }
        return true;
    } catch (error) {
        console.error("Error guardando el documento: ", error);
        // Display the specific error message from the transaction if available.
        const errorMessage = error.message.includes('ya existe') || error.message.includes('identificación único')
            ? error.message
            : "Error al guardar el registro.";
        showToast(errorMessage, 'error', { toastId });
        return false;
    }
}

export async function deleteDocument(collectionName, docId) {
    const toastId = showToast('Eliminando...', 'loading', { duration: 0 });
    try {
        await deleteDoc(doc(db, collectionName, docId));
        showToast('Elemento eliminado.', 'success', { toastId });
        // This is a side effect that should be handled by the caller.
        // if (viewConfig[appState.currentView]?.dataKey === collectionName) {
        //     runTableLogic();
        // }
    } catch (error) {
        console.error("Error deleting document: ", error);
        showToast('Error al eliminar el elemento.', 'error', { toastId });
    }
}

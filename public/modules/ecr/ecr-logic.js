import { runTransaction, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db, sendNotification } from "../../main.js";
import { COLLECTIONS } from "/utils.js";

export function checkAndUpdateEcrStatus(ecrData) {
    if (!ecrData) return 'pending-approval';

    const approvals = ecrData.approvals || {};

    // First, check if any department has rejected, regardless of current requirements.
    // A rejection is final unless explicitly overturned.
    if (Object.values(approvals).some(a => a.status === 'rejected')) {
        return 'rejected';
    }

    const requiredDepartments = Object.keys(ecrData)
        .filter(key => key.startsWith('afecta_') && ecrData[key] === true)
        .map(key => key.replace('afecta_', ''));

    // If there are no required departments and no rejections, it's approved.
    if (requiredDepartments.length === 0) {
        return 'approved';
    }

    // Now, check if all *currently required* departments have approved.
    const allRequiredApproved = requiredDepartments.every(dept => approvals[dept]?.status === 'approved');
    if (allRequiredApproved) {
        return 'approved';
    }

    return 'pending-approval';
}

export async function registerEcrApproval(ecrId, departmentId, decision, comment, deps) {
    const { firestore, appState } = deps;
    const ecrDocRef = firestore.doc(db, COLLECTIONS.ECR_FORMS, ecrId);
    try {
        await runTransaction(db, async (transaction) => {
            const ecrDoc = await transaction.get(ecrDocRef);
            if (!ecrDoc.exists()) throw "El documento ECR no existe.";
            const ecrData = ecrDoc.data();
            const oldStatus = ecrData.status;
            const newApprovals = { ...ecrData.approvals, [departmentId]: { status: decision, user: appState.currentUser.name, date: new Date().toISOString().split('T')[0], comment: comment || '' } };
            const updatedEcrData = { ...ecrData, approvals: newApprovals };
            const newStatus = checkAndUpdateEcrStatus(updatedEcrData);
            transaction.update(ecrDocRef, { approvals: newApprovals, status: newStatus, lastModified: new Date(), modifiedBy: appState.currentUser.email });
            if (newStatus !== oldStatus && (newStatus === 'approved' || newStatus === 'rejected')) {
                const creatorId = ecrData.creatorUid;
                const message = `El estado del ECR "${ecrData.ecr_no}" ha cambiado a ${newStatus}.`;
                await sendNotification(creatorId, message, 'ecr_form', { ecrId });
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Error en la transacción de aprobación de ECR:", error);
        return { success: false, error };
    }
}
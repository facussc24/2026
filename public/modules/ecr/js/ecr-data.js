/**
 * @file Manages all data interactions for the ECR module,
 * including Firestore queries and data transformations.
 */
import { collection, doc, getDoc, onSnapshot, query, orderBy, addDoc, updateDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS, ensureCollectionsAreLoaded as originalEnsureCollectionsAreLoaded, saveEcrDraftToFirestore, loadEcrDraftFromFirestore, deleteEcrDraftFromFirestore } from '../../../utils.js';

export function subscribeToEcrList(db, callback) {
    const ecrFormsRef = collection(db, COLLECTIONS.ECR_FORMS);
    const q = query(ecrFormsRef, orderBy('lastModified', 'desc'));

    return onSnapshot(q, (querySnapshot) => {
        const ecrList = [];
        querySnapshot.forEach(doc => {
            ecrList.push({ id: doc.id, ...doc.data() });
        });
        callback(ecrList, null);
    }, (error) => {
        console.error("Error fetching ECRs: ", error);
        callback(null, error);
    });
}

export async function getEcrDocument(db, ecrId) {
    const ecrRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
    const ecrDoc = await getDoc(ecrRef);
    if (ecrDoc.exists()) {
        return { id: ecrDoc.id, ...ecrDoc.data() };
    } else {
        throw new Error("ECR document not found");
    }
}

export async function saveEcrDocument(db, ecrId, data) {
    const ecrRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
    await updateDoc(ecrRef, data);
}

export async function createNewEcr(db, data) {
    const ecrFormsRef = collection(db, COLLECTIONS.ECR_FORMS);
    const newDocRef = await addDoc(ecrFormsRef, data);
    return newDocRef.id;
}

export async function generateEcrWithAI(functions, text) {
    const generateEcrDraftWithAI = httpsCallable(functions, 'generateEcrDraftWithAI');
    const result = await generateEcrDraftWithAI({ text });
    return result.data;
}

export async function callGenerateEcrProposal(functions, text) {
    const generateEcrProposal = httpsCallable(functions, 'generateEcrProposal');
    const result = await generateEcrProposal({ text });
    return result.data;
}

export async function callAnalyzeEcrImpacts(functions, situacionActual, situacionPropuesta) {
    const analyzeEcrImpacts = httpsCallable(functions, 'analyzeEcrImpacts');
    const result = await analyzeEcrImpacts({ situacionActual, situacionPropuesta });
    return result.data;
}

export async function uploadFile(storage, path, file) {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}

export function ensureCollectionsAreLoaded(db, appState, collectionKeys) {
    return originalEnsureCollectionsAreLoaded(db, { getDocs, collection }, appState, collectionKeys);
}

// Re-exporting these from utils so the UI layer only needs to import from one data file.
export { saveEcrDraftToFirestore, loadEcrDraftFromFirestore, deleteEcrDraftFromFirestore, COLLECTIONS };

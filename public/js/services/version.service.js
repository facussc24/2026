// /public/js/services/version.service.js

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp,
    doc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { Version } from "../models/Version.js";

/**
 * Creates a new version announcement in Firestore.
 * @param {string} versionTag - The version tag, e.g., "v1.2.3".
 * @param {string} notes - The release notes, can be Markdown.
 * @returns {Promise<string>} The ID of the newly created version document.
 */
export async function createVersion(versionTag, notes) {
    const auth = getAuth();
    const db = getFirestore();
    const versionsCollection = collection(db, "versiones");

    const user = auth.currentUser;
    if (!user) {
        throw new Error("User must be authenticated to create a version.");
    }

    const newVersion = {
        versionTag,
        notes,
        publishedBy: user.email,
        releaseDate: serverTimestamp(), // Use server time for consistency
    };

    try {
        const docRef = await addDoc(versionsCollection, newVersion);
        return docRef.id;
    } catch (error) {
        console.error("Error creating version in Firestore:", error);
        throw new Error("Failed to publish new version.");
    }
}

/**
 * Fetches all version announcements from Firestore, ordered by release date.
 * @returns {Promise<Version[]>} An array of Version instances.
 */
export async function getVersions() {
    const db = getFirestore();
    const versionsCollection = collection(db, "versiones");
    const q = query(versionsCollection, orderBy("releaseDate", "desc"));
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => Version.fromFirestore(doc.id, doc.data()));
    } catch (error) {
        console.error("Error fetching versions:", error);
        return [];
    }
}

/**
 * Fetches the single most recent version announcement.
 * @returns {Promise<Version|null>} The latest Version instance, or null if none exist.
 */
export async function getLatestVersion() {
    const db = getFirestore();
    const versionsCollection = collection(db, "versiones");
    const q = query(versionsCollection, orderBy("releaseDate", "desc"), limit(1));
    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const latestDoc = querySnapshot.docs[0];
            return Version.fromFirestore(latestDoc.id, latestDoc.data());
        }
        return null;
    } catch (error) {
        console.error("Error fetching latest version:", error);
        return null;
    }
}

/**
 * Fetches a single version announcement by its document ID.
 * @param {string} versionId - The ID of the version document to fetch.
 * @returns {Promise<Version|null>} The Version instance, or null if not found.
 */
export async function getVersionById(versionId) {
    if (!versionId) return null;
    const db = getFirestore();
    const docRef = doc(db, "versiones", versionId);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return Version.fromFirestore(docSnap.id, docSnap.data());
        } else {
            console.warn(`Version with ID ${versionId} not found.`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching version by ID ${versionId}:`, error);
        return null;
    }
}
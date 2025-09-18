import { getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// No longer import from eventManager to break circular dependency

let db;
const getDb = () => {
    if (!db) {
        const app = getApp("visor3d-app");
        db = getFirestore(app);
    }
    return db;
};

let currentModelName = null;
let currentAnnotations = [];

/**
 * Initializes the annotations for a given model.
 * @param {string} modelName - The name of the model.
 * @param {THREE.Scene} scene - The main Three.js scene.
 */
export async function initAnnotations(modelName, scene) {
    currentModelName = modelName;
    currentAnnotations = await loadAnnotationsFromFirestore(modelName);
    currentAnnotations.forEach(annotation => {
        createAnnotationPin(annotation, scene);
    });
}

/**
 * Loads annotations for a model from Firestore.
 * @param {string} modelName - The name of the model.
 * @returns {Promise<Array>} A promise that resolves to an array of annotations.
 */
async function loadAnnotationsFromFirestore(modelName) {
    console.log(`Loading annotations for ${modelName}...`);
    const db = getDb();
    const docRef = doc(db, "annotations", modelName);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data().annotations || [];
    } else {
        console.log("No annotations document found for this model.");
        return [];
    }
}

/**
 * Saves a new annotation to Firestore.
 * @param {object} annotation - The annotation object to save.
 */
export async function saveAnnotation(annotation) {
    if (!currentModelName) return;
    console.log(`Saving annotation for ${currentModelName}:`, annotation);
    const db = getDb();
    const docRef = doc(db, "annotations", currentModelName);
    try {
        // Use setDoc with merge: true to create the document if it doesn't exist
        // and add the new annotation to the 'annotations' array.
        await setDoc(docRef, {
            annotations: arrayUnion(annotation)
        }, { merge: true });
        console.log("Annotation saved successfully.");
    } catch (error) {
        console.error("Error saving annotation: ", error);
    }
}

/**
 * Adds a comment to a specific annotation in Firestore.
 * @param {string} annotationId - The ID of the annotation to add the comment to.
 * @param {object} comment - The comment object.
 */
export async function addCommentToAnnotation(annotationId, comment) {
    if (!currentModelName) return;

    const db = getDb();
    const docRef = doc(db, "annotations", currentModelName);

    try {
        // 1. Fetch the latest document from Firestore
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            console.error("Annotations document not found in Firestore. Cannot add comment.");
            return;
        }

        // 2. Get the current annotations array from the fetched document
        const annotations = docSnap.data().annotations || [];

        // 3. Find the specific annotation to update
        const annotationIndex = annotations.findIndex(a => a.id === annotationId);
        if (annotationIndex === -1) {
            console.error("Annotation not found in the document. Cannot add comment.");
            return;
        }

        // 4. Append the new comment
        // Ensure the comments array exists
        if (!annotations[annotationIndex].comments) {
            annotations[annotationIndex].comments = [];
        }
        annotations[annotationIndex].comments.push(comment);

        // 5. Write the entire, updated annotations array back to Firestore
        await setDoc(docRef, { annotations: annotations });

        console.log("Comment added successfully.");

        // 6. Update the local state and UI
        currentAnnotations = annotations;
        window.dispatchEvent(new CustomEvent('show-annotation', { detail: annotations[annotationIndex] }));

    } catch (error) {
        console.error("Error adding comment: ", error);
        // Inform the user that the comment could not be saved
        alert("Error: No se pudo guardar el comentario.");
    }
}


/**
 * Creates a visual pin for an annotation in the 3D scene.
 * @param {object} annotation - The annotation data.
 * @param {THREE.Scene} scene - The main Three.js scene.
 */
function createAnnotationPin(annotation, scene) {
    const pinElement = document.createElement('div');
    pinElement.className = 'annotation-pin';
    pinElement.innerHTML = `<i data-lucide="message-square" class="text-white bg-blue-500 rounded-full p-1 shadow-lg"></i>`;

    const pinObject = new CSS2DObject(pinElement);
    pinObject.position.set(annotation.position.x, annotation.position.y, annotation.position.z);
    pinObject.name = `annotation_pin_${annotation.id}`;

    pinElement.addEventListener('click', (event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('show-annotation', { detail: annotation }));
    });

    scene.add(pinObject);
    lucide.createIcons();
}

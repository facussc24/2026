import * as THREE from 'three';
import { getStorage, ref, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

import { createVisorUI, updateStatus, updateSelectionUI, disableAnnotationFeatures } from './components/uiManager.js';
import { initThreeScene, scene, camera, renderer, controls } from './components/sceneManager.js';
import { setupVisor3dEventListeners, onPointerDown, updateSelection, toggleSelectionTransparency, toggleIsolation } from './components/eventManager.js';
import { initAnnotations } from './components/annotationManager.js';

// Re-export functions and variables for tests
export { setupVisor3dEventListeners, updateSelection, toggleSelectionTransparency, toggleIsolation, scene, camera, renderer, controls };

// --- SHARED STATE AND VARIABLES ---
export const state = {
    outlinePass: null, isExploded: false, isIsolated: false, isolatedObjects: [],
    isSelectionTransparencyActive: false, preIsolationVisibility: new Map(),
    isClipping: false, isMeasuring: false, isAnnotationMode: false, isSelectionLocked: false,
};
export const selectedObjects = [];
export const modelParts = [];
export const measurementPoints = [];
export const measurementState = {
    line: null,
    label: null,
};
export const originalPositions = new Map();
export const explosionVectors = new Map();
export const transparentMaterials = new Map();
export const clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10)];
export let partCharacteristics = {};
let storage;
let currentCleanup = null;
let activeModelButton = null;

async function loadModelsFromFirebase() {
    // The storage rules are configured to only allow public access to this specific folder.
    const modelsRef = ref(storage, 'modelos3d/');
    try {
        const res = await listAll(modelsRef);
        const modelFiles = res.items.filter(item => item.name.endsWith('.glb'));
        return modelFiles.map(fileRef => ({
            name: fileRef.name.replace('.glb', ''),
            ref: fileRef,
        }));
    } catch (error) {
        console.error("Error listing files from Firebase Storage:", error);
        updateStatus("Error al conectar con Firebase Storage.", true);
        return [];
    }
}

async function loadModel(modelRef, db) {
    console.log(`Loading model from Firebase: ${modelRef.name}`);
    if (currentCleanup) {
        currentCleanup();
    }

    // Sanitize model name and prepare data URL
    const modelName = modelRef.name.replace(/\.glb$/i, '');
    const dataUrl = `modulos/visor3d/data/${modelName}.json`;

    // Reset and load part characteristics
    partCharacteristics = {};
    try {
        const response = await fetch(dataUrl);
        if (response.ok) {
            partCharacteristics = await response.json();
            console.log(`Successfully loaded characteristics for ${modelName}`);
        } else {
            console.warn(`Could not find characteristics data for ${modelName} at ${dataUrl}. Using default behavior.`);
        }
    } catch (error) {
        console.warn(`Error fetching characteristics for ${modelName}:`, error);
    }

    // Load the 3D model
    try {
        const url = await getDownloadURL(modelRef);
        currentCleanup = initThreeScene(url, onPointerDown);
        initAnnotations(modelName, scene, db);
    } catch (error) {
        console.error("Error getting download URL or initializing scene:", error);
        updateStatus(`Error al cargar el modelo ${modelName}.`, true);
    }
}

export async function runVisor3dLogic(app) {
    storage = getStorage(app);
    const db = getFirestore(app);
    console.log("Running Visor3D logic with Firebase Storage direct access...");

    createVisorUI();

    if (window.setupHelpButtonListener) {
        window.setupHelpButtonListener();
    }

    setTimeout(async () => {
        const buttonContainer = document.getElementById('model-button-container');
        if (!buttonContainer) return;

        const models = await loadModelsFromFirebase();

        if (models.length === 0) {
            buttonContainer.innerHTML = '<span class="text-sm text-slate-500">No se encontraron modelos.</span>';
            return;
        }

        buttonContainer.innerHTML = ''; // Clear "Cargando..."
        models.forEach(model => {
            const button = document.createElement('button');
            button.textContent = model.name;
            button.className = 'model-select-btn';
            button.dataset.modelName = model.name;
            button.onclick = () => {
                 if (activeModelButton) {
                    activeModelButton.classList.remove('active');
                }
                button.classList.add('active');
                activeModelButton = button;
                loadModel(model.ref, db);
            };
            buttonContainer.appendChild(button);
        });

        setupVisor3dEventListeners();

        if (models.length > 0) {
            const firstButton = buttonContainer.querySelector('.model-select-btn');
            firstButton.click();
        }

    }, 0);

    return () => {
        if (currentCleanup) {
            currentCleanup();
            currentCleanup = null;
        }
        document.body.classList.remove('visor3d-active');
        console.log("Cleaned up Visor3D main view.");
    };
}

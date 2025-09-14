import * as THREE from 'three';
import { getStorage, ref, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

import { createVisorUI, updateStatus, updateSelectionUI } from './components/uiManager.js';
import { initThreeScene, scene, camera, renderer, controls } from './components/sceneManager.js';
import { setupVisor3dEventListeners, onPointerDown, updateSelection, toggleSelectionTransparency, toggleIsolation } from './components/eventManager.js';

// Re-export functions and variables for tests
export { setupVisor3dEventListeners, updateSelection, toggleSelectionTransparency, toggleIsolation, scene, camera, renderer, controls };

// --- FIREBASE CONFIG ---
// Copied from main.js to make this module self-contained.
const firebaseConfig = {
  apiKey: "AIzaSyAUQxlBCiYoR4-tlGL-S3xR8LXrrMkx1Tk",
  authDomain: "barackingenieria-e763c.firebaseapp.com",
  projectId: "barackingenieria-e763c",
  storageBucket: "barackingenieria-e763c.appspot.com",
  messagingSenderId: "44704892099",
  appId: "1:44704892099:web:738c8cbc3cea65808a8e76",
  measurementId: "G-ZHZ3R9XXDM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig, "visor3d-app"); // Use a unique name to avoid conflicts
const storage = getStorage(app);

// --- SHARED STATE AND VARIABLES ---
export const state = {
    outlinePass: null,
    isExploded: false,
    isIsolated: false,
    isolatedObjects: [],
    isSelectionTransparencyActive: false,
    preIsolationVisibility: new Map(),
    isClipping: false,
    isMeasuring: false,
};
export const selectedObjects = [];
export const modelParts = [];
export const measurementPoints = [];
export let measurementLine = null;
export let measurementLabel = null;
export const originalPositions = new Map();
export const explosionVectors = new Map();
export const transparentMaterials = new Map();
export const clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10)
];
export let partCharacteristics = {}; // This will no longer be loaded from JSON
let currentCleanup = null;
let activeModelButton = null;

async function loadModelsFromFirebase() {
    const modelsRef = ref(storage, 'modelos3d/');
    try {
        const res = await listAll(modelsRef);
        const modelFiles = res.items.filter(item => item.name.endsWith('.glb'));
        return modelFiles;
    } catch (error) {
        console.error("Error listing files from Firebase Storage:", error);
        updateStatus("Error al conectar con Firebase Storage.", true);
        return [];
    }
}

async function loadModel(modelRef) {
    console.log(`Loading model from Firebase: ${modelRef.name}`);
    if (currentCleanup) {
        currentCleanup();
    }

    // Reset part characteristics for the new model
    partCharacteristics = {};

    try {
        const url = await getDownloadURL(modelRef);
        // The second argument to initThreeScene (onPointerDown) is passed for event handling
        currentCleanup = initThreeScene(url, onPointerDown);
    } catch (error) {
        console.error("Error getting download URL or initializing scene:", error);
        updateStatus(`Error al cargar el modelo ${modelRef.name}.`, true);
    }
}

export async function runVisor3dLogic() {
    console.log("Running Visor3D logic with Firebase Integration...");

    createVisorUI();

    if (window.setupHelpButtonListener) {
        window.setupHelpButtonListener();
    }

    setTimeout(async () => {
        const buttonContainer = document.getElementById('model-button-container');
        if (!buttonContainer) return;

        const modelFiles = await loadModelsFromFirebase();

        if (modelFiles.length === 0) {
            buttonContainer.innerHTML = '<span class="text-sm text-slate-500">No se encontraron modelos en Firebase Storage.</span>';
            return;
        }

        buttonContainer.innerHTML = ''; // Clear "Cargando..."
        modelFiles.forEach(fileRef => {
            const button = document.createElement('button');
            const modelName = fileRef.name.replace('.glb', '');
            button.textContent = modelName;
            button.className = 'model-select-btn';
            button.dataset.modelName = fileRef.fullPath; // Use full path as a unique ID
            buttonContainer.appendChild(button);
        });

        buttonContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.model-select-btn');
            if (button) {
                const modelFullPath = button.dataset.modelName;
                const modelRef = ref(storage, modelFullPath);

                // Deactivate previously active button
                if (activeModelButton) {
                    activeModelButton.classList.remove('active');
                }
                // Activate clicked button
                button.classList.add('active');
                activeModelButton = button;

                loadModel(modelRef);
            }
        });

        setupVisor3dEventListeners();

        // Auto-load the first model in the list
        if (modelFiles.length > 0) {
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

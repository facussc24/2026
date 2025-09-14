import * as THREE from 'three';
import { getStorage, ref, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

import { createVisorUI, updateStatus, updateSelectionUI } from './components/uiManager.js';
import { initThreeScene, scene, camera, renderer, controls } from './components/sceneManager.js';
import { setupVisor3dEventListeners, onPointerDown, updateSelection, toggleSelectionTransparency, toggleIsolation } from './components/eventManager.js';
import { initAnnotations } from './components/annotationManager.js';

// Re-export functions and variables for tests
export { setupVisor3dEventListeners, updateSelection, toggleSelectionTransparency, toggleIsolation, scene, camera, renderer, controls };

// --- FIREBASE CONFIG ---
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
const app = initializeApp(firebaseConfig, "visor3d-app");
const storage = getStorage(app);

// --- SHARED STATE AND VARIABLES ---
export const state = {
    outlinePass: null, isExploded: false, isIsolated: false, isolatedObjects: [],
    isSelectionTransparencyActive: false, preIsolationVisibility: new Map(),
    isClipping: false, isMeasuring: false, isAnnotationMode: false,
};
export const selectedObjects = [];
export const modelParts = [];
export const measurementPoints = [];
export let measurementLine = null;
export let measurementLabel = null;
export const originalPositions = new Map();
export const explosionVectors = new Map();
export const transparentMaterials = new Map();
export const clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10)];
export let partCharacteristics = {};
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

async function loadModel(modelRef) {
    console.log(`Loading model from Firebase: ${modelRef.name}`);
    if (currentCleanup) {
        currentCleanup();
    }
    partCharacteristics = {};
    try {
        const url = await getDownloadURL(modelRef);
        currentCleanup = initThreeScene(url, onPointerDown);
        initAnnotations(modelRef.name.replace('.glb', ''), scene);
    } catch (error) {
        console.error("Error getting download URL or initializing scene:", error);
        updateStatus(`Error al cargar el modelo ${modelRef.name}.`, true);
    }
}

export async function runVisor3dLogic() {
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
                loadModel(model.ref);
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

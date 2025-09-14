import * as THREE from 'three';
import { createVisorUI, updateStatus } from './components/uiManager.js';
import { initThreeScene, scene, camera, renderer, controls } from './components/sceneManager.js';
import { setupVisor3dEventListeners, onPointerDown, updateSelection, toggleSelectionTransparency, toggleIsolation } from './components/eventManager.js';

// Re-export functions and variables for tests
export { setupVisor3dEventListeners, updateSelection, toggleSelectionTransparency, toggleIsolation, scene, camera, renderer, controls };

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
export let partCharacteristics = {};
let currentCleanup = null;

async function loadModel(modelId) {
    console.log(`Loading model: ${modelId}`);
    if (currentCleanup) {
        currentCleanup();
    }

    try {
        const response = await fetch(`modulos/visor3d/data/${modelId}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        partCharacteristics = await response.json();
    } catch (error) {
        console.error("Could not load part characteristics:", error);
        partCharacteristics = {};
        updateStatus(`Error al cargar datos de ${modelId}`, true);
        return;
    }

    currentCleanup = initThreeScene(modelId, onPointerDown);
}

export async function runVisor3dLogic() {
    console.log("Running Visor3D logic (refactored)...");

    createVisorUI();

    if (window.setupHelpButtonListener) {
        window.setupHelpButtonListener();
    }

    const selector = document.getElementById('model-selector');
    try {
        const response = await fetch('/api/models');
        const models = await response.json();

        if (models.length === 0) {
            updateStatus("No se encontraron modelos.", true);
            selector.innerHTML = '<option value="">No hay modelos</option>';
            return;
        }

        selector.innerHTML = '<option value="">-- Seleccionar Modelo --</option>';
        models.forEach(model => {
            selector.innerHTML += `<option value="${model.id}">${model.name}</option>`;
        });

        if (models.length > 0) {
            selector.value = models[0].id;
            await loadModel(models[0].id);
        }

    } catch (e) {
        console.error("Failed to load model list from API:", e);
        selector.innerHTML = '<option value="">Error al cargar</option>';
        updateStatus("Error: No se pudo conectar con el servidor.", true);
    }

    setupVisor3dEventListeners();

    selector.addEventListener('change', (e) => {
        if (e.target.value) {
            loadModel(e.target.value);
        }
    });

    return () => {
        if (currentCleanup) {
            currentCleanup();
            currentCleanup = null;
        }
        document.body.classList.remove('visor3d-active');
        console.log("Cleaned up Visor3D main view.");
    };
}

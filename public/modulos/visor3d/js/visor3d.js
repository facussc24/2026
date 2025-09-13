import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// Visor3D Module
export let scene, camera, renderer, controls;
export const state = {
    outlinePass: null,
    isExploded: false,
    isIsolated: false,
    isolatedObjects: [],
    isSelectionTransparencyActive: false,
    preIsolationVisibility: new Map(),
    isClipping: false,
};
let ambientLight, directionalLight;
let composer, fxaaPass;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
export const selectedObjects = [];
let isTransparent = false;
const exteriorMaterials = [];
export let modelParts = [];
const originalPositions = new Map();
const explosionVectors = new Map();
export const transparentMaterials = new Map();
const clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 10)
];

export let partCharacteristics = {}; // This will be loaded from JSON
let currentCleanup = null;

async function loadModel(modelId) {
    console.log(`Loading model: ${modelId}`);
    // If there's an old scene, clean it up first
    if (currentCleanup) {
        currentCleanup();
    }

    try {
        const response = await fetch(`modulos/visor3d/data/${modelId}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        partCharacteristics = await response.json();
    } catch (error) {
        console.error("Could not load part characteristics:", error);
        partCharacteristics = {}; // Reset to avoid using stale data
        updateStatus(`Error al cargar datos de ${modelId}`, true);
        return;
    }

    // Initialize the scene and get the new cleanup function
    currentCleanup = initThreeScene(modelId);
}

// This function will be called by main.js to start the 3D viewer.
export async function runVisor3dLogic() {
    console.log("Running Visor3D logic...");

    const container = document.getElementById('view-content');
    if (!container) return;

    container.innerHTML = `
        <div id="visor3d-container">
            <div id="visor3d-scene-container">
                <div id="visor3d-status" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/80 z-10">
                    <p id="visor3d-status-text" class="text-slate-600 font-semibold text-lg animate-pulse mb-4">Seleccione un modelo para comenzar...</p>
                    <div id="visor3d-progress-bar-container" class="w-1/2 bg-slate-300 rounded-full h-4 hidden">
                        <div id="visor3d-progress-bar" class="bg-blue-500 h-4 rounded-full" style="width: 0%"></div>
                    </div>
                </div>
            </div>
            <div id="visor3d-panel">
                <div id="visor3d-panel-header">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-lg font-bold">Piezas del Modelo</h3>
                        <select id="model-selector" class="text-sm border-gray-300 rounded-md">
                            <option value="">Cargando...</option>
                        </select>
                    </div>
                    <div class="flex justify-between items-center">
                        <div id="visor3d-controls" class="flex items-center gap-2">
                            <button id="explode-btn" class="visor3d-control-btn" title="Vista explosionada"><i data-lucide="move-3d"></i></button>
                            <button id="isolate-btn" class="visor3d-control-btn" title="Aislar Pieza" disabled><i data-lucide="zap"></i></button>
                            <button id="selection-transparency-btn" class="visor3d-control-btn" title="Ver Selección (Transparentar el Resto)"><i data-lucide="group"></i></button>
                            <button id="clipping-btn" class="visor3d-control-btn" title="Vista de Sección"><i data-lucide="scissors"></i></button>
                            <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                            <button id="help-tutorial-btn" class="p-2 rounded-full hover:bg-slate-100" title="Ayuda y Tutorial">
                                <i data-lucide="help-circle" class="w-6 h-6 text-slate-600"></i>
                            </button>
                        </div>
                    </div>
                    <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                </div>
                <div id="visor3d-controls-container" class="p-2 border-b border-slate-200">
                    <details class="visor-section">
                        <summary>Controles Visuales</summary>
                        <div class="visor-section-content">
                            <label for="bg-color">Fondo</label>
                            <input type="color" id="bg-color" value="#404040">

                            <label for="sun-intensity">Intensidad Sol</label>
                            <input type="range" id="sun-intensity" min="0" max="4" step="0.1" value="2.5">

                            <label for="ambient-light">Luz Ambiente</label>
                            <input type="range" id="ambient-light" min="0" max="2" step="0.05" value="0.5">

                            <div id="explode-controls" class="hidden mt-2">
                                <label for="explode-factor" class="font-semibold text-sm text-slate-600">Distancia de Explosión</label>
                                <input type="range" id="explode-factor" min="0" max="5" step="0.1" value="1.5" class="w-full mt-1">
                            </div>
                        </div>
                    </details>
                    <details id="clipping-controls-details" class="visor-section">
                        <summary>Controles de Corte</summary>
                        <div class="visor-section-content">
                            <div class="mb-2">
                                <label class="font-semibold text-sm text-slate-600">Eje de Corte</label>
                                <div id="clipping-axis-buttons" class="grid grid-cols-3 gap-2 mt-1">
                                    <button data-axis="x" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100 active">X</button>
                                    <button data-axis="y" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100">Y</button>
                                    <button data-axis="z" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100">Z</button>
                                </div>
                            </div>
                            <div>
                                <label for="clipping-position" class="font-semibold text-sm text-slate-600">Posición</label>
                                <input type="range" id="clipping-position" min="-5" max="5" step="0.1" value="5" class="w-full mt-1">
                            </div>
                        </div>
                    </details>
                </div>
                <div id="visor3d-parts-list"></div>
                <div id="visor3d-piece-card" class="border-t border-slate-200 p-4 hidden">
                    <div class="flex justify-between items-center mb-2">
                        <h4 id="piece-card-title" class="text-md font-bold"></h4>
                        <button id="zoom-to-part-btn" class="p-1 text-slate-500 hover:text-blue-600" title="Enfocar pieza">
                            <i data-lucide="zoom-in" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div id="piece-card-details"></div>
                </div>
            </div>
        </div>
    `;
    document.body.classList.add('visor3d-active');
    lucide.createIcons();

    // Ensure details panels are closed by default
    document.querySelectorAll('.visor-section').forEach(details => details.open = false);

    setupVisor3dEventListeners();
    if (window.setupHelpButtonListener) {
        window.setupHelpButtonListener();
    }

    // Fetch model list from the new API endpoint and populate selector
    const selector = document.getElementById('model-selector');
    try {
        const response = await fetch('/api/models');
        const models = await response.json();

        if (models.length === 0) {
            updateStatus("No se encontraron modelos. Agregue modelos en la carpeta 'public/modulos/visor3d/modelos'.", true);
            selector.innerHTML = '<option value="">No hay modelos</option>';
            return;
        }

        selector.innerHTML = '<option value="">-- Seleccionar Modelo --</option>';
        models.forEach(model => {
            selector.innerHTML += `<option value="${model.id}">${model.name}</option>`;
        });

        // Load the first model by default
        if (models.length > 0) {
            selector.value = models[0].id;
            loadModel(models[0].id);
        }

    } catch (e) {
        console.error("Failed to load model list from API:", e);
        selector.innerHTML = '<option value="">Error al cargar</option>';
        updateStatus("Error: No se pudo conectar con el servidor para cargar la lista de modelos.", true);
    }

    selector.addEventListener('change', (e) => {
        if (e.target.value) {
            loadModel(e.target.value);
        }
    });

    // Return a cleanup function for when the user navigates away from the viewer
    return () => {
        if (currentCleanup) {
            currentCleanup();
            currentCleanup = null;
        }
        document.body.classList.remove('visor3d-active');
        console.log("Cleaned up Visor3D main view.");
    };
}

function updateStatus(message, isError = false, showProgressBar = false) {
    const statusEl = document.getElementById('visor3d-status');
    const statusText = document.getElementById('visor3d-status-text');
    const progressBarContainer = document.getElementById('visor3d-progress-bar-container');

    if (statusEl && statusText && progressBarContainer) {
        if (message) {
            statusEl.classList.remove('hidden');
            statusText.textContent = message;
            statusText.className = `font-semibold text-lg ${isError ? 'text-red-500' : 'text-slate-600'} ${isError ? '' : 'animate-pulse'}`;

            if (showProgressBar) {
                progressBarContainer.classList.remove('hidden');
            } else {
                progressBarContainer.classList.add('hidden');
            }
        } else {
            statusEl.classList.add('hidden');
        }
    }
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x404040);
}

function setupCamera(container) {
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.01, 5000);
    camera.position.z = 5;
}

function setupRenderer(container) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
}

function setupControls(camera, renderer) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
}

function setupLights(scene) {
    // Lights - Improved setup
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // A bit more ambient light to soften shadows
    scene.add(ambientLight);

    // Main directional light (simulating the sun)
    directionalLight = new THREE.DirectionalLight(0xffffff, 2.5); // Increased intensity for brighter highlights
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; // Higher resolution for sharper shadows
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    const shadowCamSize = 15;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.0005; // Helps prevent shadow acne
    scene.add(directionalLight);

    // A fill light from the opposite side to reduce harshness
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, -5, -7.5);
    scene.add(fillLight);

    // A soft light from above
    const hemisphereLight = new THREE.HemisphereLight(0xeeeeff, 0x444488, 0.4);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);
}

function initThreeScene(modelId) {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

    // Clear any previous scene content
    container.innerHTML = '';
    updateStatus('Cargando modelo 3D...', false, true);

    setupScene();
    setupCamera(container);
    setupRenderer(container);
    setupControls(camera, renderer);
    setupLights(scene);

    // GLTFLoader
    const loader = new GLTFLoader();
    loader.load(`modulos/visor3d/modelos/${modelId}/model.glb`,
    (gltf) => { // onLoad
        updateStatus('Procesando modelo...');
        const model = gltf.scene;

        // --- FIX: Remove camera from loaded model ---
        const modelCamera = model.getObjectByProperty('type', 'PerspectiveCamera');
        if (modelCamera) {
            console.log("Removing camera from loaded GLB model.");
            modelCamera.parent.remove(modelCamera);
        }

        scene.add(model);

        // Center the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Environment, Ground, and Shadows
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        new RGBELoader()
            .setPath('modulos/visor3d/imagenes/')
            .load('studio_small_03_1k.hdr', function (texture) {
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                pmremGenerator.dispose();

                scene.environment = envMap; // Keep the environment map for reflections
                // Set a solid color background for better contrast
                scene.background = new THREE.Color(0x404040);
            }, undefined, () => {
                console.error("Failed to load HDR environment map. Make sure 'studio_small_03_1k.hdr' is in 'public/modulos/visor3d/imagenes/'.");
                updateStatus("Error: No se pudo cargar el mapa de entorno.", true);
            });

        const centeredBox = new THREE.Box3().setFromObject(model);
        const groundY = centeredBox.min.y;

        // Grid
        const grid = new THREE.GridHelper(200, 40, 0x888888, 0x888888);
        grid.material.opacity = 0.3;
        grid.material.transparent = true;
        grid.position.y = groundY;
        scene.add(grid);

        // Shadow Catcher
        const shadowPlaneGeo = new THREE.PlaneGeometry(200, 200);
        const shadowPlaneMat = new THREE.ShadowMaterial({
            opacity: 0.5
        });
        const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = groundY + 0.01; // Place it slightly above the grid
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        // Adjust camera to fit the model
        const size = box.getSize(new THREE.Vector3());

        // --- Guardian Check for model size ---
        if (size.x === 0 && size.y === 0 && size.z === 0) {
            console.error("Guardian Error: The model's bounding box is zero. The model may be empty or have no visible geometry.");
            updateStatus("Error: El modelo está vacío o no es visible.", true);
            return; // Stop further processing
        }

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);

        // Correct formula to fit object in view: distance = (size / 2) / tan(fov / 2)
        const cameraDistance = (maxDim / 2) / Math.tan(fov / 2);

        // Position camera to fit the model, with a little extra distance
        const cameraZ = center.z + cameraDistance * 1.2;
        const cameraY = center.y + maxDim / 4; // Look from a slightly elevated angle

        camera.position.set(center.x, cameraY, cameraZ);

        // Since the model has been centered at the world origin, the camera should look at (0,0,0).
        const lookAtVector = new THREE.Vector3(0, 0, 0);
        camera.lookAt(lookAtVector);

        if (controls) {
            controls.target.copy(lookAtVector);
            controls.update();
        }

        // --- Deep Model Inspection ---
        console.log("--- Deep Model Inspection ---");
        let meshFound = false;
        model.traverse((child) => {
            let prefix = '';
            let current = child;
            while (current.parent && current.parent.type !== 'Scene') {
                prefix += '  ';
                current = current.parent;
            }
            console.log(`${prefix}- Object: ${child.name || '[unnamed]'} | Type: ${child.type} | Visible: ${child.visible}`);
            if (child.isMesh) {
                meshFound = true;
            }
        });
        if (!meshFound) {
            console.warn("Guardian Warning: No meshes were found in the loaded model.");
            updateStatus("Error: El modelo cargado no contiene partes visibles.", true);
            return; // Stop processing if model is empty
        }
        console.log("--- End of Inspection ---");


        // Populate parts list and enable shadows
        modelParts = []; // Clear previous parts
        const partNames = new Set();
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.name) {
                    partNames.add(child.name);
                    modelParts.push(child);
                }
            }
        });
        renderPartsList(Array.from(partNames));

        updateStatus(null); // Hide status on success

    },
    (xhr) => { // onProgress
        if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            const progressBar = document.getElementById('visor3d-progress-bar');
            if (progressBar) {
                progressBar.style.width = percentComplete + '%';
            }
            updateStatus(`Cargando modelo: ${Math.round(percentComplete)}%`, false, true);
        }
    },
    (error) => { // onError
        console.error('An error happened while loading the model:', error);
        updateStatus('Error: No se pudo cargar el modelo 3D. Verifique la consola para más detalles.', true);
    });

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

    // Post-processing
    composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    state.outlinePass = new OutlinePass(new THREE.Vector2(container.offsetWidth, container.offsetHeight), scene, camera);
    state.outlinePass.edgeStrength = 5;
    state.outlinePass.edgeGlow = 0.5;
    state.outlinePass.edgeThickness = 1;
    state.outlinePass.visibleEdgeColor.set('#007bff');
    state.outlinePass.hiddenEdgeColor.set('#007bff');
    composer.addPass(state.outlinePass);

    fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (container.offsetWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (container.offsetHeight * pixelRatio);
    composer.addPass(fxaaPass);


    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        if (typeof TWEEN !== 'undefined') {
            TWEEN.update();
        }

        // Enforce isolation every frame to prevent camera controls from resetting visibility
        if (state.isIsolated) {
            const isolatedUuids = new Set(state.isolatedObjects.map(obj => obj.uuid));
            modelParts.forEach(part => {
                const shouldBeVisible = isolatedUuids.has(part.uuid);
                if (part.visible !== shouldBeVisible) {
                    part.visible = shouldBeVisible;
                }
            });
        }

        composer.render();
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    return () => {
        // Reset state for next time
        modelParts = [];
        exteriorMaterials.length = 0;
        originalPositions.clear();
        explosionVectors.clear(); // Clear the calculated vectors
        state.isExploded = false;
        isTransparent = false;
        selectedObjects.length = 0;
        // originalMaterials.clear();
        state.isIsolated = false;
        state.isolatedObjects = [];
        state.isSelectionTransparencyActive = false;
        transparentMaterials.clear();
        state.preIsolationVisibility.clear();
        state.isClipping = false;
        renderer.clippingPlanes = [];
        partCharacteristics = {};

        console.log("Cleaning up Visor3D scene.");
        if (renderer) {
            renderer.dispose();
        }
        window.removeEventListener('resize', onWindowResize);
        const partsList = document.getElementById('visor3d-parts-list');
        if(partsList) partsList.innerHTML = '';
    };
}

function onWindowResize() {
    const container = document.getElementById('visor3d-scene-container');
    if (container && camera && renderer) {
        const width = container.offsetWidth;
        const height = container.offsetHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        composer.setSize(width, height);

        const pixelRatio = renderer.getPixelRatio();
        fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
        fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
}

export function updateSelection(objectToSelect, isCtrlPressed) {
    const pieceCard = document.getElementById('visor3d-piece-card');
    const isolateBtn = document.getElementById('isolate-btn');

    if (!isCtrlPressed) {
        // Single selection
        selectedObjects.length = 0;
        if (objectToSelect && objectToSelect.isMesh) {
            selectedObjects.push(objectToSelect);
        }
    } else {
        // Multi-selection (Ctrl pressed)
        if (objectToSelect && objectToSelect.isMesh) {
            const index = selectedObjects.findIndex(obj => obj.uuid === objectToSelect.uuid);
            if (index > -1) {
                // Already selected, so deselect it
                selectedObjects.splice(index, 1);
            } else {
                // Not selected, so add it
                selectedObjects.push(objectToSelect);
            }
        }
        // If ctrl-clicking in empty space, do nothing to the current selection.
    }

    // Update the outline pass with the new selection
    if (state.outlinePass) {
        state.outlinePass.selectedObjects = selectedObjects;
    }

    // --- UI Updates ---

    // Update Isolate Button state
    if (isolateBtn) {
        isolateBtn.disabled = selectedObjects.length === 0;
    }

    // Update Piece Card visibility and content
    if (pieceCard) {
        const lastSelected = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;
        if (lastSelected) {
            updatePieceCard(lastSelected);
            pieceCard.classList.remove('hidden');
        } else {
            pieceCard.classList.add('hidden');
        }
    }

    // --- Highlight in Parts List ---
    document.querySelectorAll('#visor3d-parts-list li').forEach(li => {
        li.classList.remove('selected-part');
    });
    selectedObjects.forEach(obj => {
        const partName = obj.name;
        const listItem = document.querySelector(`#visor3d-parts-list li[data-part-name="${partName}"]`);
        if (listItem) {
            listItem.classList.add('selected-part');
        }
    });

    // After any selection change, re-apply the transparency logic if it's active.
    applySelectionTransparency();
}

function updatePieceCard(object) {
    const pieceTitle = document.getElementById('piece-card-title');
    const detailsContainer = document.getElementById('piece-card-details');
    if (!pieceTitle || !detailsContainer) return;

    const partName = object.name;
    const displayName = partName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    pieceTitle.textContent = displayName;

    let characteristics = partCharacteristics[partName] || partCharacteristics[partName.split('_')[0]];

    // Filter out the explosionVector before rendering
    const characteristicsToDisplay = { ...characteristics };
    delete characteristicsToDisplay.explosionVector;


    if (characteristics && Object.keys(characteristicsToDisplay).length > 0) {
        detailsContainer.innerHTML = Object.entries(characteristicsToDisplay).map(([key, value]) => `
            <div class="flex justify-between py-1 border-b border-slate-200 text-sm">
                <span class="font-semibold text-slate-500">${key.replace(/_/g, ' ')}:</span>
                <span class="text-right text-slate-700">${value}</span>
            </div>`).join('');
    } else {
        detailsContainer.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-200 text-sm">
                <span class="font-semibold text-slate-500">Nombre:</span>
                <span class="text-right text-slate-700">${displayName}</span>
            </div>
            <p class="text-slate-400 italic py-2 mt-2 text-sm">No hay más información detallada disponible.</p>`;
    }
}


function onPointerDown(event) {
    // Check if the click is on the GUI; if so, do not trigger the raycaster.
    // This prevents accidental selections when interacting with lil-gui.
    const isGuiInteraction = event.target.closest('.lil-gui');
    if (isGuiInteraction) {
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Ensure we only intersect with the model parts, not helpers or the ground
    const intersectableObjects = modelParts.length > 0 ? modelParts : scene.children;
    const intersects = raycaster.intersectObjects(intersectableObjects, true);

    let targetObject = null;
    if (intersects.length > 0) {
        // Find the first visible mesh that was clicked
        const firstVisibleHit = intersects.find(hit => hit.object.visible && hit.object.isMesh);
        if (firstVisibleHit) {
            targetObject = firstVisibleHit.object;
        }
    }

    // A click on empty space (no targetObject) with Ctrl NOT pressed should clear selection.
    // If Ctrl is pressed, a click on empty space should do nothing (preserve selection).
    if (!targetObject && !event.ctrlKey) {
        updateSelection(null, false);
    } else if (targetObject && targetObject.name) {
        // Only update selection if a valid, named object was clicked.
        updateSelection(targetObject, event.ctrlKey);
    }
}

function renderPartsList(partNames) {
    const partsListContainer = document.getElementById('visor3d-parts-list');
    if (!partsListContainer) return;

    if (partNames.length === 0) {
        partsListContainer.innerHTML = '<p class="text-sm text-slate-500 p-4">No se encontraron piezas nombradas en el modelo.</p>';
        return;
    }

    partsListContainer.innerHTML = `
        <ul class="divide-y divide-slate-200">
            ${partNames.map(partName => `
                <li class="flex items-center justify-between p-2 hover:bg-slate-100" data-part-name="${partName}">
                    <button class="flex-grow text-left text-sm p-1">
                        ${partName}
                    </button>
                    <button class="p-2 text-slate-500 hover:text-blue-600" data-action="toggle-visibility" title="Ocultar/Mostrar Pieza">
                        <i data-lucide="eye" class="pointer-events-none"></i>
                    </button>
                </li>
            `).join('')}
        </ul>
    `;
    lucide.createIcons();
}

function updateExplosion(factor) {
    const animationDuration = 300; // A shorter duration for slider updates

    modelParts.forEach(mesh => {
        const originalPos = originalPositions.get(mesh.uuid);
        const explosionVec = explosionVectors.get(mesh.uuid);

        if (!originalPos || !explosionVec) return;

        // The explosion vector is cloned to avoid modifying the stored vector
        const offset = explosionVec.clone().multiplyScalar(factor);
        const targetPosition = new THREE.Vector3().copy(originalPos).add(offset);

        if (!mesh.position.equals(targetPosition)) {
            new TWEEN.Tween(mesh.position)
                .to(targetPosition, animationDuration)
                .easing(TWEEN.Easing.Quadratic.Out)
                .start();
        }
    });
}

function toggleExplodeView() {
    state.isExploded = !state.isExploded;
    const btn = document.getElementById('explode-btn');
    if (btn) btn.classList.toggle('active', state.isExploded);

    const explodeControls = document.getElementById('explode-controls');
    if (explodeControls) {
        explodeControls.classList.toggle('hidden', !state.isExploded);
    }

    // On first explosion, calculate and store original positions and explosion vectors
    if (state.isExploded && originalPositions.size === 0) {
        modelParts.forEach(mesh => {
            originalPositions.set(mesh.uuid, mesh.position.clone());

            const characteristics = partCharacteristics[mesh.name] || partCharacteristics[mesh.name.split('_')[0]];

            // Prioritize manually defined vector from JSON
            if (characteristics && characteristics.explosionVector) {
                const definedVec = characteristics.explosionVector;
                explosionVectors.set(mesh.uuid, new THREE.Vector3(definedVec[0], definedVec[1], definedVec[2]));
            } else {
                // If no vector is defined, calculate it automatically
                const partBox = new THREE.Box3().setFromObject(mesh);
                const partCenter = partBox.getCenter(new THREE.Vector3());
                // The vector from the model's center (origin) to the part's center
                // This creates a natural radial explosion.
                explosionVectors.set(mesh.uuid, partCenter);
            }
        });
    }

    const factor = state.isExploded ? document.getElementById('explode-factor').value : 0;
    updateExplosion(factor);
}


export function toggleIsolation() {
    if (selectedObjects.length === 0 && !state.isIsolated) {
        // Don't do anything if nothing is selected and we are not already in isolation mode
        return;
    }

    state.isIsolated = !state.isIsolated;
    const isolateBtn = document.getElementById('isolate-btn');
    if (isolateBtn) {
        isolateBtn.classList.toggle('active', state.isIsolated);
    }
    const icon = isolateBtn.querySelector('i');

    if (state.isIsolated) {
        // Entering isolation mode: store current visibility states
        state.preIsolationVisibility.clear();
        modelParts.forEach(part => {
            state.preIsolationVisibility.set(part.uuid, part.visible);
        });

        state.isolatedObjects = [...selectedObjects]; // Store the objects to be isolated
        const isolatedUuids = new Set(state.isolatedObjects.map(obj => obj.uuid));

        modelParts.forEach(part => {
            part.visible = isolatedUuids.has(part.uuid);
        });

        isolateBtn.setAttribute('title', 'Mostrar Todo');
        icon.setAttribute('data-lucide', 'eye');
    } else {
        // Exiting isolation mode: restore previous visibility states
        state.isolatedObjects = [];
        modelParts.forEach(part => {
            // Restore visibility from the map, default to true if not found
            part.visible = state.preIsolationVisibility.has(part.uuid) ? state.preIsolationVisibility.get(part.uuid) : true;
        });
        state.preIsolationVisibility.clear(); // Clean up the map

        isolateBtn.setAttribute('title', 'Aislar Pieza');
        icon.setAttribute('data-lucide', 'zap');
    }
    lucide.createIcons();
}


function applySelectionTransparency(forceRestore = false) {
    if (!state.isSelectionTransparencyActive && !forceRestore) {
        // If the mode is being turned off, we need to restore materials.
        // The `forceRestore` flag ensures this happens.
        if (!forceRestore) return;
    }

    const selectedUuids = new Set(selectedObjects.map(obj => obj.uuid));

    modelParts.forEach(part => {
        const isSelected = selectedUuids.has(part.uuid);

        // Condition to make a part transparent:
        // - The mode must be active (`state.isSelectionTransparencyActive`)
        // - The part must NOT be in the current selection (`!isSelected`)
        // - We are not in the process of restoring everything (`!forceRestore`)
        if (state.isSelectionTransparencyActive && !isSelected && !forceRestore) {
            if (!transparentMaterials.has(part.uuid)) {
                // Store the original material before making it transparent
                transparentMaterials.set(part.uuid, part.material);

                const makeTransparent = (material) => {
                    const transparentMat = material.clone();
                    transparentMat.transparent = true;
                    transparentMat.opacity = 0.1;
                    transparentMat.emissive = new THREE.Color(0x000000); // Ensure no self-glow
                    transparentMat.depthWrite = false; // Important for correct rendering
                    return transparentMat;
                };

                if (Array.isArray(part.material)) {
                    part.material = part.material.map(makeTransparent);
                } else {
                    part.material = makeTransparent(part.material);
                }
            }
        } else {
            // Condition to restore a part's material:
            // - If the part was previously made transparent (`transparentMaterials.has(part.uuid)`)
            // - This will trigger when the mode is turned off (`!state.isSelectionTransparencyActive` or `forceRestore`)
            // - Or when a part becomes selected (`isSelected`)
            if (transparentMaterials.has(part.uuid)) {
                part.material = transparentMaterials.get(part.uuid);
                transparentMaterials.delete(part.uuid);
            }
        }
        if (Array.isArray(part.material)) {
            part.material.forEach(m => m.needsUpdate = true);
        } else {
            part.material.needsUpdate = true;
        }
    });
}

export function toggleSelectionTransparency() {
    state.isSelectionTransparencyActive = !state.isSelectionTransparencyActive;
    const btn = document.getElementById('selection-transparency-btn');

    document.body.dataset.animationStatus = 'running';

    if (state.isSelectionTransparencyActive) {
        btn.classList.add('active');
        // When activating, apply transparency to all non-selected parts
        applySelectionTransparency();
    } else {
        btn.classList.remove('active');
        // When deactivating, restore all parts that were made transparent
        applySelectionTransparency(true); // `forceRestore = true`
    }

    setTimeout(() => {
        document.body.dataset.animationStatus = 'finished';
    }, 500);
}

function zoomToSelection() {
    if (selectedObjects.length === 0) return;

    const object = selectedObjects[0]; // Zoom to the first selected object
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = (maxDim / 1.5) / Math.tan(fov / 2);

    // Animate camera position
    new TWEEN.Tween(camera.position)
        .to({
            x: center.x,
            y: center.y + size.y / 2, // Look from a slightly elevated angle
            z: center.z + cameraDistance
        }, 800)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    // Animate camera target
    new TWEEN.Tween(controls.target)
        .to(center, 800)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            camera.lookAt(controls.target);
        })
        .start();
}

function toggleClippingView() {
    state.isClipping = !state.isClipping;
    const btn = document.getElementById('clipping-btn');
    const controls = document.getElementById('clipping-controls-details');
    btn.classList.toggle('active', state.isClipping);
    controls.open = state.isClipping;

    if (state.isClipping) {
        // When turning on, set the renderer's planes
        renderer.clippingPlanes = clippingPlanes;
        // Add a helper to visualize the plane
        const planeHelper = new THREE.PlaneHelper(clippingPlanes[0], 5, 0x00ff00);
        planeHelper.name = 'clipping-plane-helper';
        scene.add(planeHelper);
    } else {
        // When turning off, clear the renderer's planes
        renderer.clippingPlanes = [];
        // Remove the helper
        const helper = scene.getObjectByName('clipping-plane-helper');
        if (helper) {
            scene.remove(helper);
        }
    }
}

export function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const isolateBtn = document.getElementById('isolate-btn');
    const selectionTransparencyBtn = document.getElementById('selection-transparency-btn');
    const partsList = document.getElementById('visor3d-parts-list');
    const searchInput = document.getElementById('visor3d-search');
    const zoomBtn = document.getElementById('zoom-to-part-btn');
    if (zoomBtn) {
        zoomBtn.addEventListener('click', zoomToSelection);
    }
    const closeCardBtn = document.getElementById('close-card-btn');
    const bgColorPicker = document.getElementById('bg-color');
    const sunIntensitySlider = document.getElementById('sun-intensity');
    const ambientLightSlider = document.getElementById('ambient-light');
    const explodeSlider = document.getElementById('explode-factor');

    if (explodeSlider) {
        explodeSlider.addEventListener('input', (e) => {
            if(state.isExploded) {
                updateExplosion(e.target.value);
            }
        });
    }

    if (bgColorPicker && scene) {
        bgColorPicker.addEventListener('input', (e) => {
            scene.background.set(e.target.value);
        });
    }

    if (sunIntensitySlider && directionalLight) {
        sunIntensitySlider.addEventListener('input', (e) => {
            directionalLight.intensity = parseFloat(e.target.value);
        });
    }

    if (ambientLightSlider && ambientLight) {
        ambientLightSlider.addEventListener('input', (e) => {
            ambientLight.intensity = parseFloat(e.target.value);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const partsListItems = document.querySelectorAll('#visor3d-parts-list li');
            const highlightedObjects = [];

            partsListItems.forEach(li => {
                const partName = li.dataset.partName.toLowerCase();
                if (partName.includes(searchTerm)) {
                    // The list items use flexbox, so set display to 'flex'
                    li.style.display = 'flex';
                    if (searchTerm.length > 0) {
                        const part = modelParts.find(p => p.name.toLowerCase() === partName);
                        if (part) {
                            highlightedObjects.push(part);
                        }
                    }
                } else {
                    li.style.display = 'none';
                }
            });

            if (state.outlinePass) {
                if (searchTerm.length > 0) {
                    // When searching, the outline should show the search results
                    state.outlinePass.selectedObjects = highlightedObjects;
                } else {
                    // When search is cleared, restore the outline to the user's actual selection
                    state.outlinePass.selectedObjects = selectedObjects;
                }
            }
        });
    }

    if (closeCardBtn) {
        closeCardBtn.addEventListener('click', () => {
            const pieceCard = document.getElementById('visor3d-piece-card');
            if (pieceCard) {
                pieceCard.classList.add('hidden');
            }
            // Also deselect all objects
            updateSelection(null, false);
        });
    }

    if (isolateBtn) {
        isolateBtn.addEventListener('click', toggleIsolation);
    }

    if (selectionTransparencyBtn) {
        selectionTransparencyBtn.addEventListener('click', toggleSelectionTransparency);
    }

    const clippingBtn = document.getElementById('clipping-btn');
    if (clippingBtn) {
        clippingBtn.addEventListener('click', toggleClippingView);
    }

    const clippingAxisButtons = document.getElementById('clipping-axis-buttons');
    const clippingPositionSlider = document.getElementById('clipping-position');
    let activeClipAxis = 'x'; // Default axis

    function updateClippingPlane() {
        if (!state.isClipping) return;

        const normals = {
            x: new THREE.Vector3(-1, 0, 0),
            y: new THREE.Vector3(0, -1, 0),
            z: new THREE.Vector3(0, 0, -1)
        };

        clippingPlanes[0].normal.copy(normals[activeClipAxis]);
        clippingPlanes[0].constant = parseFloat(clippingPositionSlider.value);

        // Also update the plane helper if it exists
        const helper = scene.getObjectByName('clipping-plane-helper');
        if (helper) {
            helper.plane = clippingPlanes[0];
            helper.updateMatrixWorld(true);
        }
    }

    if (clippingAxisButtons) {
        clippingAxisButtons.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                // Remove active class from all buttons
                clippingAxisButtons.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                // Add active class to the clicked button
                e.target.classList.add('active');
                activeClipAxis = e.target.dataset.axis;
                updateClippingPlane();
            }
        });
    }

    if (clippingPositionSlider) {
        clippingPositionSlider.addEventListener('input', updateClippingPlane);
    }

    if (partsList) {
        partsList.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-part-name]');
            if (!listItem) return;

            const partName = listItem.dataset.partName;
            const partToAffect = modelParts.find(p => p.name === partName);
            if (!partToAffect) return;

            const actionButton = e.target.closest('button[data-action]');

            if (actionButton && actionButton.dataset.action === 'toggle-visibility') {
                // Handle visibility toggle
                partToAffect.visible = !partToAffect.visible;
                const icon = actionButton.querySelector('i');
                icon.setAttribute('data-lucide', partToAffect.visible ? 'eye' : 'eye-off');
                lucide.createIcons({nodes: [icon]});
            } else {
                // Handle selection
                updateSelection(partToAffect, e.ctrlKey);
            }
        });
    }

    if (explodeBtn) {
        explodeBtn.addEventListener('click', toggleExplodeView);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (state.isExploded) {
                toggleExplodeView(); // Implode the model
            }
            // Deactivate selection transparency if active
            if (state.isSelectionTransparencyActive) {
                toggleSelectionTransparency();
            }
            // Exit isolation mode if active
            if (state.isIsolated) {
                toggleIsolation();
            }
            if (state.isClipping) {
                toggleClippingView();
            }

            // --- FIX: Restore visibility of all parts ---
            modelParts.forEach(part => {
                if (!part.visible) {
                    part.visible = true;
                }
            });
             // After making all parts visible, update the UI in the parts list
            const allVisibilityIcons = document.querySelectorAll('#visor3d-parts-list button[data-action="toggle-visibility"] i');
            allVisibilityIcons.forEach(icon => {
                if (icon.getAttribute('data-lucide') === 'eye-off') {
                    icon.setAttribute('data-lucide', 'eye');
                    lucide.createIcons({nodes: [icon.parentElement]});
                }
            });


            if (controls) {
                controls.reset();
            }
            // Also deselect any object
            updateSelection(null, false);
        });
    }
}

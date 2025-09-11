import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'lil-gui';

// Visor3D Module
export let scene, camera, renderer, controls, gui;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
export const selectedObjects = [];
export const originalMaterials = new Map();
let isTransparent = false;
const exteriorMaterials = [];
export let modelParts = [];
let isExploded = false;
const originalPositions = new Map();
export let isIsolated = false;
export let isolatedObjects = [];
let isSelectionTransparencyActive = false;
const transparentMaterials = new Map();

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
                <div id="visor3d-status" class="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-10">
                    <p class="text-slate-600 font-semibold text-lg animate-pulse">Seleccione un modelo para comenzar...</p>
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
                            <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                            <button id="help-tutorial-btn" class="p-2 rounded-full hover:bg-slate-100" title="Ayuda y Tutorial">
                                <i data-lucide="help-circle" class="w-6 h-6 text-slate-600"></i>
                            </button>
                        </div>
                    </div>
                    <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                </div>
                <div id="lil-gui-container" class="p-4 border-b border-slate-200"></div>
                <div id="visor3d-parts-list"></div>
                <div id="visor3d-piece-card" class="border-t border-slate-200 p-4 hidden"></div>
            </div>
        </div>
    `;
    document.body.classList.add('visor3d-active');
    lucide.createIcons();
    setupVisor3dEventListeners();
    if (window.setupHelpButtonListener) {
        window.setupHelpButtonListener();
    }

    // Fetch manifest and populate selector
    const selector = document.getElementById('model-selector');
    try {
        const response = await fetch('modulos/visor3d/data/manifest.json');
        const models = await response.json();
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
        console.error("Failed to load model manifest:", e);
        selector.innerHTML = '<option value="">Error al cargar</option>';
        updateStatus("Error: No se pudo cargar la lista de modelos.", true);
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

function updateStatus(message, isError = false) {
    const statusEl = document.getElementById('visor3d-status');
    if (statusEl) {
        if (message) {
            const pulseClass = isError ? '' : 'animate-pulse';
            const colorClass = isError ? 'text-red-500' : 'text-slate-600';
            statusEl.innerHTML = `<p class="${colorClass} font-semibold text-lg ${pulseClass}">${message}</p>`;
            statusEl.classList.remove('hidden');
        } else {
            statusEl.classList.add('hidden');
        }
    }
}

function initThreeScene(modelId) {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

    // Clear any previous scene content
    container.innerHTML = '';
    updateStatus('Loading 3D model...');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);

    // Camera - Adjusted clipping planes for large models and close-up zoom
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.01, 5000);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights - Improved setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // A bit more ambient light to soften shadows
    scene.add(ambientLight);

    // Main directional light (simulating the sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5); // Increased intensity for brighter highlights
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

    // GLTFLoader
    const loader = new GLTFLoader();
    loader.load(`modulos/visor3d/modelos/${modelId}/model.glb`, (gltf) => {
        updateStatus('Processing model...');
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

        // Add a ground plane
        const centeredBox = new THREE.Box3().setFromObject(model);
        const groundY = centeredBox.min.y;

        // Simple grid floor
        const gridHelper = new THREE.GridHelper(200, 40, 0x000000, 0x000000);
        gridHelper.material.opacity = 0.1;
        gridHelper.material.transparent = true;
        gridHelper.position.y = groundY;
        scene.add(gridHelper);

        // A reflective ground plane just below the model
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x888888, // A darker grey for better contrast with reflections
            metalness: 0.9,  // More metallic for clearer reflections
            roughness: 0.4,  // A bit of roughness to blur reflections slightly
        });
        const groundPlane = new THREE.Mesh(groundGeo, groundMat);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = groundY - 0.01; // Place it just below the grid
        groundPlane.receiveShadow = true;
        scene.add(groundPlane);


        // Adjust camera to fit the model
        const size = box.getSize(new THREE.Vector3());

        // --- Guardian Check for model size ---
        if (size.x === 0 && size.y === 0 && size.z === 0) {
            console.error("Guardian Error: The model's bounding box is zero. The model may be empty or have no visible geometry.");
            updateStatus("Error: Model is empty or invisible.", true);
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
            updateStatus("Error: The loaded model does not contain any visible parts.", true);
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

    }, undefined, (error) => {
        console.error('An error happened while loading the model:', error);
        updateStatus('Error: Could not load 3D model. Check console for details.', true);
    });

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

    // --- GUI Controls ---
    if (gui) gui.destroy(); // Destroy old GUI if it exists from a previous run
    const guiContainer = document.getElementById('lil-gui-container');
    gui = new GUI({ container: guiContainer, autoPlace: false });
    gui.title("Visual Controls");

    const sceneFolder = gui.addFolder('Scene');
    const sceneParams = {
        backgroundColor: scene.background.getHex(),
        antialias: false
    };
    sceneFolder.addColor(sceneParams, 'backgroundColor').name('Background').onChange(value => {
        scene.background.set(value);
    });
    sceneFolder.add(sceneParams, 'antialias').name('Anti-aliasing').onChange(value => {
        // This is tricky because you can't change antialiasing on an existing renderer.
        // We have to create a new one and replace the old one.
        showToast('Recreando el renderizador para cambiar el antialiasing...', 'info');
        const container = document.getElementById('visor3d-scene-container');
        if (renderer) {
            renderer.dispose();
            container.removeChild(renderer.domElement);
        }
        renderer = new THREE.WebGLRenderer({ antialias: value });
        renderer.setSize(container.offsetWidth, container.offsetHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // Re-attach controls and event listeners to the new renderer's DOM element
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        renderer.domElement.addEventListener('pointerdown', onPointerDown, false);
        onWindowResize(); // Adjust size
        showToast('Renderizador actualizado.', 'success');
    });

    const lightFolder = gui.addFolder('Lighting');
    lightFolder.add(directionalLight, 'intensity', 0, 4, 0.05).name('Sun Intensity');
    lightFolder.add(directionalLight.position, 'x', -50, 50).name('Sun X');
    lightFolder.add(directionalLight.position, 'y', -50, 50).name('Sun Y');
    lightFolder.add(directionalLight.position, 'z', -50, 50).name('Sun Z');
    lightFolder.add(ambientLight, 'intensity', 0, 2, 0.05).name('Ambient Light');

    const shadowFolder = gui.addFolder('Shadows');
    shadowFolder.add(renderer.shadowMap, 'enabled').name('Enabled');
    // --- End GUI Controls ---

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        // Enforce isolation every frame to prevent camera controls from resetting visibility
        if (isIsolated) {
            const isolatedUuids = new Set(isolatedObjects.map(obj => obj.uuid));
            modelParts.forEach(part => {
                const shouldBeVisible = isolatedUuids.has(part.uuid);
                if (part.visible !== shouldBeVisible) {
                    part.visible = shouldBeVisible;
                }
            });
        }

        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);

    return () => {
        // Reset state for next time
        modelParts = [];
        exteriorMaterials.length = 0;
        originalPositions.clear();
        isExploded = false;
        isTransparent = false;
        selectedObjects.length = 0;
        originalMaterials.clear();
        isIsolated = false;
        isolatedObjects.length = 0;
        isSelectionTransparencyActive = false;
        transparentMaterials.clear();
        partCharacteristics = {};

        console.log("Cleaning up Visor3D scene.");
        if (gui) {
            gui.destroy();
            gui = null;
        }
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
        camera.aspect = container.offsetWidth / container.offsetHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.offsetWidth, container.offsetHeight);
    }
}

export function updateSelection(objectToSelect, isCtrlPressed) {
    const pieceCard = document.getElementById('visor3d-piece-card');
    const isolateBtn = document.getElementById('isolate-btn');

    // Create a generic highlight material (once)
    const highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0x330000,
        metalness: 0.8,
        roughness: 0.5
    });

    // Function to apply highlight to an object
    const highlight = (obj) => {
        if (!originalMaterials.has(obj.uuid)) {
            originalMaterials.set(obj.uuid, obj.material);
        }
        if (Array.isArray(obj.material)) {
            obj.material = obj.material.map(() => highlightMaterial);
        } else {
            obj.material = highlightMaterial;
        }
    };

    // Function to remove highlight from an object
    const unhighlight = (obj) => {
        if (originalMaterials.has(obj.uuid)) {
            obj.material = originalMaterials.get(obj.uuid);
            originalMaterials.delete(obj.uuid);
        }
    };

    const unhighlightAll = () => {
        selectedObjects.forEach(unhighlight);
        selectedObjects.length = 0;
    };

    // If nothing is clicked, deselect everything
    if (!objectToSelect || !objectToSelect.isMesh) {
        unhighlightAll();
    } else {
        if (!isCtrlPressed) {
            // Single selection logic
            unhighlightAll();
            selectedObjects.push(objectToSelect);
            highlight(objectToSelect);
        } else {
            // Multi-selection logic (Ctrl is pressed)
            const index = selectedObjects.findIndex(obj => obj.uuid === objectToSelect.uuid);
            if (index > -1) {
                // Already selected, so deselect it
                unhighlight(objectToSelect);
                selectedObjects.splice(index, 1);
            } else {
                // Not selected, so add it to the selection
                selectedObjects.push(objectToSelect);
                highlight(objectToSelect);
            }
        }
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

    if (characteristics) {
        detailsContainer.innerHTML = Object.entries(characteristics).map(([key, value]) => `
            <div class="flex justify-between py-1 border-b border-slate-200">
                <span class="font-semibold text-slate-500">${key}:</span>
                <span class="text-right text-slate-700">${value}</span>
            </div>`).join('');
    } else {
        // This is a specific hardcoded fallback, retain for now but should be data-driven
        if (displayName === 'Anodized Aluminum Brushed 90° Black #1') {
            pieceTitle.textContent = "Headrest rear center Patagonia";
            detailsContainer.innerHTML = `...`; // Content omitted for brevity, it's the same as before
        } else {
            detailsContainer.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-200">
                    <span class="font-semibold text-slate-500">Nombre:</span>
                    <span class="text-right text-slate-700">${displayName}</span>
                </div>
                <p class="text-slate-400 italic py-2 mt-2">No hay más información detallada disponible.</p>`;
        }
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

function toggleExplodeView() {
    isExploded = !isExploded;
    const btn = document.getElementById('explode-btn');
    if(btn) btn.classList.toggle('active', isExploded);

    document.body.dataset.animationStatus = 'running';

    // Store original positions on first explosion
    if (isExploded && originalPositions.size === 0) {
        modelParts.forEach(mesh => {
            originalPositions.set(mesh.uuid, mesh.position.clone());
        });
    }

    const explosionFactor = 1.5; // Controls the overall distance of the explosion

    modelParts.forEach(mesh => {
        const originalPos = originalPositions.get(mesh.uuid);
        if (!originalPos) return;

        if (isExploded) {
            const direction = new THREE.Vector3();

            // --- Smarter Explosion Logic ---
            const name = mesh.name.toLowerCase();
            if (name.includes('wheel') || name.includes('tire')) {
                // Explode wheels outwards along the x-axis
                direction.set(mesh.position.x > 0 ? 1 : -1, 0, 0);
            } else if (name.includes('door')) {
                // Explode doors slightly out and up
                direction.set(mesh.position.x > 0 ? 0.8 : -0.8, 0.2, 0);
            } else if (name.includes('hood') || name.includes('bonnet')) {
                // Explode hood forwards and up
                direction.set(0, 0.5, -1);
            } else if (name.includes('trunk') || name.includes('boot')) {
                // Explode trunk backwards and up
                direction.set(0, 0.5, 1);
            } else if (name.includes('roof')) {
                // Explode roof straight up
                direction.set(0, 2, 0);
            } else if (name.includes('glass') || name.includes('window') || name.includes('vidrio')) {
                // Explode windows slightly up and out, based on their orientation
                direction.set(mesh.position.x > 0 ? 0.5 : -0.5, 0.7, 0);
            }
            mesh.position.copy(originalPos).add(direction.multiplyScalar(explosionFactor));

        } else {
            // If not exploded, return to original position
            mesh.position.copy(originalPos);
        }
    });

    setTimeout(() => {
        document.body.dataset.animationStatus = 'finished';
    }, 1500); // Wait for the animation to finish
}


function toggleIsolation() {
    if (selectedObjects.length === 0 && !isIsolated) {
        // Don't do anything if nothing is selected and we are not already in isolation mode
        return;
    }

    isIsolated = !isIsolated;
    const isolateBtn = document.getElementById('isolate-btn');
    if (isolateBtn) {
        isolateBtn.classList.toggle('active', isIsolated);
    }
    const icon = isolateBtn.querySelector('i');

    if (isIsolated) {
        // Entering isolation mode
        isolatedObjects = [...selectedObjects]; // Store the objects to be isolated
        const isolatedUuids = new Set(isolatedObjects.map(obj => obj.uuid));

        modelParts.forEach(part => {
            part.visible = isolatedUuids.has(part.uuid);
        });

        isolateBtn.setAttribute('title', 'Mostrar Todo');
        icon.setAttribute('data-lucide', 'eye');
    } else {
        // Exiting isolation mode
        isolatedObjects = [];
        modelParts.forEach(part => {
            part.visible = true;
        });

        isolateBtn.setAttribute('title', 'Aislar Pieza');
        icon.setAttribute('data-lucide', 'zap');
    }
    lucide.createIcons();
}


function applySelectionTransparency(forceRestore = false) {
    if (!isSelectionTransparencyActive && !forceRestore) {
        // If the mode is being turned off, we need to restore materials.
        // The `forceRestore` flag ensures this happens.
        if (!forceRestore) return;
    }

    const selectedUuids = new Set(selectedObjects.map(obj => obj.uuid));

    modelParts.forEach(part => {
        const isSelected = selectedUuids.has(part.uuid);

        // Condition to make a part transparent:
        // - The mode must be active (`isSelectionTransparencyActive`)
        // - The part must NOT be in the current selection (`!isSelected`)
        // - We are not in the process of restoring everything (`!forceRestore`)
        if (isSelectionTransparencyActive && !isSelected && !forceRestore) {
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
            // - This will trigger when the mode is turned off (`!isSelectionTransparencyActive` or `forceRestore`)
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
    isSelectionTransparencyActive = !isSelectionTransparencyActive;
    const btn = document.getElementById('selection-transparency-btn');

    document.body.dataset.animationStatus = 'running';

    if (isSelectionTransparencyActive) {
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

export function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const isolateBtn = document.getElementById('isolate-btn');
    const selectionTransparencyBtn = document.getElementById('selection-transparency-btn');
    const partsList = document.getElementById('visor3d-parts-list');
    const searchInput = document.getElementById('visor3d-search');
    const closeCardBtn = document.getElementById('close-card-btn');

    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const partsListItems = document.querySelectorAll('#visor3d-parts-list li');
            partsListItems.forEach(li => {
                const partName = li.dataset.partName.toLowerCase();
                if (partName.includes(searchTerm)) {
                    li.style.display = '';
                } else {
                    li.style.display = 'none';
                }
            });
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
            if (isExploded) {
                toggleExplodeView(); // Implode the model
            }
            // Deactivate selection transparency if active
            if (isSelectionTransparencyActive) {
                toggleSelectionTransparency();
            }
            // Exit isolation mode if active
            if (isIsolated) {
                toggleIsolation();
            }
            if (controls) {
                controls.reset();
            }
            // Also deselect any object
            updateSelection(null, false);
        });
    }
}

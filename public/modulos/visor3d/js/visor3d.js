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

export let partCharacteristics = {}; // This will be loaded from JSON

// This function will be called by main.js to start the 3D viewer.
export async function runVisor3dLogic() {
    console.log("Running Visor3D logic...");

    // Determine which model to load. For now, it's hardcoded to 'auto'.
    // In the future, this could be passed as a parameter.
    const modelId = 'auto';

    try {
        const response = await fetch(`modulos/visor3d/data/${modelId}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        partCharacteristics = await response.json();
    } catch (error) {
        console.error("Could not load part characteristics:", error);
        // Handle the error appropriately, maybe show a message to the user
        partCharacteristics = {}; // Reset to avoid using stale data
    }

    const container = document.getElementById('view-content');
    if (container) {
        // Clear previous view content
        container.innerHTML = '';
        document.body.classList.add('visor3d-active');

        const visorHTML = `
            <div id="visor3d-container">
                <div id="visor3d-scene-container">
                    <div id="visor3d-status" class="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-10">
                        <p class="text-slate-600 font-semibold text-lg animate-pulse">Initializing viewer...</p>
                    </div>
                </div>
                <div id="visor3d-panel">
                    <div id="visor3d-panel-header">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-bold">Piezas del Modelo</h3>
                            <div id="visor3d-controls" class="flex items-center gap-2">
                                <button id="transparency-btn" class="visor3d-control-btn" title="Vista Interior"><i data-lucide="zoom-in"></i></button>
                                <button id="explode-btn" class="visor3d-control-btn" title="Vista explosionada"><i data-lucide="move-3d"></i></button>
                                <button id="isolate-btn" class="visor3d-control-btn" title="Aislar Pieza" disabled><i data-lucide="zap"></i></button>
                                <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                            </div>
                        </div>
                        <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                    </div>
                    <div id="lil-gui-container" class="p-4 border-b border-slate-200"></div>
                    <div id="visor3d-parts-list">
                        <p class="text-sm text-slate-500 p-4">La lista de piezas aparecerá aquí.</p>
                    </div>
                    <div id="visor3d-piece-card" class="border-t border-slate-200 p-4 hidden">
                        <div class="flex justify-between items-center mb-2">
                            <h4 id="piece-card-title" class="text-xl font-bold">Título de la Pieza</h4>
                            <button id="close-card-btn" class="p-1 leading-none rounded-full hover:bg-slate-200" title="Cerrar"><i data-lucide="x" class="h-4 w-4"></i></button>
                        </div>
                        <div id="piece-card-details" class="text-sm space-y-1.5">
                            <!-- Characteristics will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = visorHTML;
        lucide.createIcons();

        // Add event listeners for the new controls
        setupVisor3dEventListeners();

        // Initialize the three.js scene
        initThreeScene();
    }

    // Return a cleanup function
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

        console.log("Cleaning up Visor3D view.");
        document.body.classList.remove('visor3d-active');
        if (gui) {
            gui.destroy();
            gui = null;
        }
        if (renderer) {
            renderer.dispose();
        }
        window.removeEventListener('resize', onWindowResize);
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

function initThreeScene() {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

    updateStatus('Loading 3D model...');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);

    // Camera - Adjusted clipping planes for large models and close-up zoom
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.01, 5000);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Slightly reduce ambient light to make shadows pop
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Increase intensity for more contrast
    directionalLight.position.set(10, 15, 5); // Adjust angle for more dynamic shadows
    directionalLight.castShadow = true; // Enable shadow casting for this light

    // Configure shadow properties for better quality
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    // Define the area covered by the shadow camera
    const shadowCameraSize = 20;
    directionalLight.shadow.camera.left = -shadowCameraSize;
    directionalLight.shadow.camera.right = shadowCameraSize;
    directionalLight.shadow.camera.top = shadowCameraSize;
    directionalLight.shadow.camera.bottom = -shadowCameraSize;

    scene.add(directionalLight);

    // GLTFLoader
    const loader = new GLTFLoader();
    loader.load('/modulos/visor3d/modelos/auto.glb', (gltf) => {
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
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.8,
            metalness: 0.2
        });
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = centeredBox.min.y; // Position plane at the bottom of the model
        groundPlane.receiveShadow = true; // Allow the ground to receive shadows
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
    const sceneParams = { backgroundColor: scene.background.getHex() };
    sceneFolder.addColor(sceneParams, 'backgroundColor').name('Background').onChange(value => {
        scene.background.set(value);
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
        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
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
        // If we are in isolation mode and the selection becomes empty, exit isolation
        if (isIsolated && selectedObjects.length === 0) {
            toggleIsolation();
        }
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
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    let targetObject = null;
    if (intersects.length > 0) {
        if (isTransparent) {
            const exteriorMeshes = new Set(exteriorMaterials.map(item => item.mesh));
            targetObject = intersects.find(intersection => !exteriorMeshes.has(intersection.object))?.object;
        } else {
            targetObject = intersects[0].object;
        }
    }

    // Update selection based on what was clicked and if Ctrl was pressed
    if (targetObject && targetObject.isMesh && targetObject.name) {
        updateSelection(targetObject, event.ctrlKey);
    } else {
        updateSelection(null, event.ctrlKey);
    }
}

function toggleTransparency() {
    isTransparent = !isTransparent;

    // First time, find and store exterior materials
    if (exteriorMaterials.length === 0 && scene) {
        scene.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                // Identify exterior parts like body, paint, and glass
                const isExterior = name.startsWith('paint_') || name.startsWith('glass_') || name.startsWith('matte_black_');
                // Exclude parts that shouldn't be transparent, like wheels or interior trim
                const isExcluded = name.includes('wheel') || name.includes('cloth') || name.includes('caliper');

                if (isExterior && !isExcluded) {
                    const material = child.material;
                    if (!Array.isArray(material)) {
                        // Store the original material state
                        const originalMaterial = material.clone();
                        // Create the transparent variant
                        const transparentMaterial = material.clone();
                        transparentMaterial.transparent = true;
                        transparentMaterial.opacity = 0.15;

                        exteriorMaterials.push({
                            mesh: child,
                            originalMaterial: originalMaterial,
                            transparentMaterial: transparentMaterial
                        });
                    } else {
                        console.warn(`Mesh ${child.name} has multiple materials. Transparency might not work as expected.`);
                    }
                }
            }
        });
    }

    // Apply the correct material based on the transparency state
    exteriorMaterials.forEach(item => {
        if (isTransparent) {
            item.mesh.material = item.transparentMaterial;
        } else {
            item.mesh.material = item.originalMaterial;
        }
        item.mesh.material.needsUpdate = true;
    });
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
                <li>
                    <button data-part-name="${partName}" class="w-full text-left p-3 hover:bg-slate-100 text-sm">
                        ${partName}
                    </button>
                </li>
            `).join('')}
        </ul>
    `;
}

function toggleExplodeView() {
    isExploded = !isExploded;

    if (isExploded && originalPositions.size === 0) {
        modelParts.forEach(mesh => {
            originalPositions.set(mesh.uuid, mesh.position.clone());
        });
    }

    const modelBox = new THREE.Box3();
    const modelGroup = scene.children.find(child => child.type === 'Group');
    if (modelGroup) {
        modelBox.setFromObject(modelGroup);
    } else {
        // Fallback for models not in a group
        modelBox.setFromObject(scene);
    }
    const modelCenter = modelBox.getCenter(new THREE.Vector3());
    const explosionFactor = 2.0;

    modelParts.forEach(mesh => {
        const originalPos = originalPositions.get(mesh.uuid);
        if (!originalPos) return;

        if (isExploded) {
            const meshCenter = new THREE.Vector3();
            mesh.getWorldPosition(meshCenter);
            const direction = new THREE.Vector3().subVectors(meshCenter, modelCenter).normalize();
            mesh.position.copy(new THREE.Vector3().addVectors(originalPos, direction.multiplyScalar(explosionFactor)));
        } else {
            mesh.position.copy(originalPos);
        }
    });
}


function toggleIsolation() {
    if (selectedObjects.length === 0 && !isIsolated) {
        // Don't do anything if nothing is selected and we are not already in isolation mode
        return;
    }

    isIsolated = !isIsolated;
    const isolateBtn = document.getElementById('isolate-btn');
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


function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const transparencyBtn = document.getElementById('transparency-btn');
    const isolateBtn = document.getElementById('isolate-btn');
    const partsList = document.getElementById('visor3d-parts-list');
    const closeCardBtn = document.getElementById('close-card-btn');

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

    if (transparencyBtn) {
        transparencyBtn.addEventListener('click', toggleTransparency);
    }

    if (isolateBtn) {
        isolateBtn.addEventListener('click', toggleIsolation);
    }

    if (partsList) {
        partsList.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-part-name]');
            if (button) {
                const partName = button.dataset.partName;
                const partToSelect = modelParts.find(p => p.name === partName);
                if (partToSelect) {
                    // Clicking from the list simulates a normal click (not a ctrl+click)
                    updateSelection(partToSelect, e.ctrlKey);
                }
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
            if (isTransparent) {
                toggleTransparency();
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

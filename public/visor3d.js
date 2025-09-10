import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Visor3D Module
let scene, camera, renderer, controls;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null;
let originalMaterial = null;
let isTransparent = false;
const exteriorMaterials = [];
let modelParts = [];
let isExploded = false;
const originalPositions = new Map();

// This function will be called by main.js to start the 3D viewer.
export function runVisor3dLogic() {
    console.log("Running Visor3D logic...");
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
                        <h3 class="text-lg font-bold">Piezas del Modelo</h3>
                        <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                    </div>
                    <div id="visor3d-parts-list">
                        <p class="text-sm text-slate-500 p-4">La lista de piezas aparecerá aquí.</p>
                    </div>
                </div>
                <div id="visor3d-controls">
                    <button id="transparency-btn" class="visor3d-control-btn" title="Alternar transparencia"><i data-lucide="glasses"></i></button>
                    <button id="explode-btn" class="visor3d-control-btn" title="Vista explosionada"><i data-lucide="move-3d"></i></button>
                    <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                </div>
                <button id="visor3d-help-btn" class="visor3d-control-btn" title="Ayuda"><i data-lucide="help-circle"></i></button>
                <div id="visor3d-piece-card" class="hidden">
                    <h4 id="piece-card-title" class="text-xl font-bold mb-2">Título de la Pieza</h4>
                    <p id="piece-card-desc" class="text-sm text-slate-600 mb-4">Descripción de la pieza.</p>
                    <button class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">Más Info</button>
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
        selectedObject = null;

        console.log("Cleaning up Visor3D view.");
        document.body.classList.remove('visor3d-active');
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

    // Camera
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // GLTFLoader
    const loader = new GLTFLoader();
    loader.load('auto.glb', (gltf) => {
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

        let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
        cameraZ *= 1.5; // Zoom out a bit

        camera.position.z = center.z + cameraZ;
        camera.position.y = center.y + size.y / 4;

        const lookAtVector = new THREE.Vector3(center.x, center.y, center.z);
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


        // Populate parts list
        modelParts = []; // Clear previous parts
        const partNames = new Set();
        model.traverse((child) => {
            if (child.isMesh && child.name) {
                partNames.add(child.name);
                modelParts.push(child);
            }
        });
        renderPartsList(Array.from(partNames));

        updateStatus(null); // Hide status on success

    }, undefined, (error) => {
        console.error('An error happened while loading the model:', error);
        updateStatus('Error: Could not load 3D model. Check console for details.', true);
    });

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

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

function selectObject(objectToSelect) {
    // Deselect previous
    if (selectedObject) {
        selectedObject.material = originalMaterial;
        selectedObject = null;
    }

    const pieceCard = document.getElementById('visor3d-piece-card');
    if (!objectToSelect || !objectToSelect.isMesh) {
        if (pieceCard) pieceCard.classList.add('hidden');
        return;
    }

    // Select new object
    selectedObject = objectToSelect;
    originalMaterial = objectToSelect.material;

    const highlightMaterial = objectToSelect.material.clone();
    highlightMaterial.color.set(0xff0000); // Highlight in red
    highlightMaterial.emissive.set(0x330000);
    objectToSelect.material = highlightMaterial;

    const pieceTitle = document.getElementById('piece-card-title');
    const pieceDesc = document.getElementById('piece-card-desc');
    if (pieceCard && pieceTitle && pieceDesc) {
        pieceTitle.textContent = objectToSelect.name;
        pieceDesc.textContent = `Este es el ${objectToSelect.name}. Haz clic en otros componentes para ver sus detalles.`;
        pieceCard.classList.remove('hidden');
    }
}

function onPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        const firstIntersected = intersects[0].object;
        // The console log revealed seats are named like 'Car_Cloth_shader'
        if (firstIntersected.isMesh && firstIntersected.name.toLowerCase().includes('cloth')) {
            selectObject(firstIntersected);
        } else {
            selectObject(null); // Deselect if clicking on non-seat part
        }
    } else {
        selectObject(null); // Deselect if clicking on empty space
    }
}

function toggleTransparency() {
    isTransparent = !isTransparent;

    // First time, find and store exterior materials
    if (exteriorMaterials.length === 0 && scene) {
        scene.traverse((child) => {
            const name = child.name.toLowerCase();
            if (child.isMesh && (name.startsWith('paint_') || name.startsWith('glass_'))) {
                const material = child.material;
                // Ensure material is not an array
                if (!Array.isArray(material)) {
                    exteriorMaterials.push({
                        mesh: child,
                        originalOpacity: material.opacity,
                        originalTransparent: material.transparent
                    });
                } else {
                    // Handle multi-material objects if necessary
                    console.warn(`Mesh ${child.name} has multiple materials. Transparency might not work as expected.`);
                }
            }
        });
    }

    exteriorMaterials.forEach(item => {
        // Make a copy of the material to avoid sharing state
        if (!item.transparentMaterial) {
            item.transparentMaterial = item.mesh.material.clone();
            item.transparentMaterial.transparent = true;
            item.transparentMaterial.opacity = 0.2;
        }

        if (isTransparent) {
            item.mesh.material = item.transparentMaterial;
        } else {
            // Revert to original material properties
            item.mesh.material.transparent = item.originalTransparent;
            item.mesh.material.opacity = item.originalOpacity;
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


function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const helpBtn = document.getElementById('visor3d-help-btn');
    const transparencyBtn = document.getElementById('transparency-btn');
    const partsList = document.getElementById('visor3d-parts-list');

    if (transparencyBtn) {
        transparencyBtn.addEventListener('click', toggleTransparency);
    }

    if (partsList) {
        partsList.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-part-name]');
            if (button) {
                const partName = button.dataset.partName;
                const partToSelect = modelParts.find(p => p.name === partName);
                if (partToSelect) {
                    if (partToSelect.name.toLowerCase().includes('cloth')) {
                        selectObject(partToSelect);
                    } else {
                        selectObject(null);
                        console.log(`Selección de la pieza '${partName}' no implementada desde la lista.`);
                    }
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
            if (controls) {
                controls.reset();
            }
            // Also deselect any object
            selectObject(null);
        });
    }

    if (helpBtn) {
        helpBtn.addEventListener('click', showHelpModal);
    }
}

function showHelpModal() {
    const modalId = 'visor3d-help-modal';
    // Prevent creating duplicate modals
    if (document.getElementById(modalId)) return;

    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[1100] animate-fade-in">
            <div class="bg-white rounded-lg shadow-2xl w-full max-w-2xl m-4 modal-content transform animate-scale-in">
                <div class="flex justify-between items-center p-5 border-b">
                    <h2 class="text-2xl font-bold text-slate-800 flex items-center gap-3"><i data-lucide="help-circle" class="text-blue-500"></i>Guía del Visor 3D</h2>
                    <button data-action="close-modal" class="text-slate-400 hover:text-slate-800 p-2 rounded-full"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
                <div class="p-6 text-slate-700 space-y-4">
                    <div>
                        <h3 class="font-bold text-lg mb-2">Controles de la Cámara</h3>
                        <ul class="list-disc list-inside space-y-1 pl-2">
                            <li><strong>Orbitar:</strong> Mantén presionado el clic izquierdo del mouse y arrastra para girar alrededor del modelo.</li>
                            <li><strong>Zoom:</strong> Usa la rueda del mouse para acercar o alejar.</li>
                            <li><strong>Mover (Pan):</strong> Mantén presionado el clic derecho del mouse y arrastra para mover la cámara.</li>
                        </ul>
                    </div>
                    <div>
                        <h3 class="font-bold text-lg mb-2">Interactuar con el Modelo</h3>
                        <ul class="list-disc list-inside space-y-1 pl-2">
                            <li><strong>Seleccionar Pieza:</strong> Haz clic en cualquier pieza interior para resaltarla y ver su descripción.</li>
                            <li><strong>Panel Lateral:</strong> Usa la lista en el panel derecho para ver todas las piezas disponibles y buscarlas por nombre.</li>
                            <li><strong>Vista Explosionada:</strong> Usa el botón <i data-lucide="move-3d" class="inline-block w-4 h-4 -mt-1"></i> para separar las piezas y ver cómo encajan.</li>
                        </ul>
                    </div>
                     <div>
                        <h3 class="font-bold text-lg mb-2">Compartir</h3>
                        <p class="pl-2">Para compartir una vista directa a este visor, simplemente copia y pega la URL de tu navegador. La dirección terminará en <strong>/visor3d</strong>.</p>
                    </div>
                </div>
                <div class="flex justify-end p-4 bg-slate-50 border-t">
                    <button data-action="close-modal" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Entendido</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement || e.target.closest('[data-action="close-modal"]')) {
            modalElement.remove();
        }
    });
}

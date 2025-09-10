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

// --- Base de datos simulada de características de piezas ---
const partCharacteristics = {
    'chassis': {
        'ID de Pieza': 'CH-MAIN-001',
        'Material': 'Acero de alta resistencia',
        'Peso (kg)': 800,
        'Tratamiento': 'Galvanizado por inmersión en caliente',
        'Rigidez Torsional (Nm/deg)': 35000
    },
    'engine_block': {
        'ID de Pieza': 'EN-BLK-001',
        'Material': 'Aleación de Aluminio',
        'Peso (kg)': 150,
        'Fabricante': 'AutoParts Co.',
        'Fecha de Fabricación': '2023-05-12'
    },
    'piston': {
        'ID de Pieza': 'PS-045',
        'Material': 'Acero Forjado',
        'Peso (kg)': 1.2,
        'Fabricante': 'Engine Systems',
        'Tolerancia': '0.01mm'
    },
    'seat_front_left': {
        'ID de Pieza': 'SEAT-FL-089',
        'Material': 'Cuero sintético, Espuma de alta densidad',
        'Peso (kg)': 25,
        'Proveedor': 'ComfortRide Inc.',
        'Características': 'Ajuste lumbar, Calefactable'
    },
    'seat_front_right': {
        'ID de Pieza': 'SEAT-FR-090',
        'Material': 'Cuero sintético, Espuma de alta densidad',
        'Peso (kg)': 25,
        'Proveedor': 'ComfortRide Inc.',
        'Características': 'Ajuste lumbar, Calefactable'
    },
    'wheel_front_left': {
        'ID de Pieza': 'WHL-FL-303',
        'Material': 'Aleación de Magnesio',
        'Peso (kg)': 12,
        'Dimensiones': '18" x 8.5"',
        'Fabricante': 'WheelPros'
    },
    'wheel_front_right': {
        'ID de Pieza': 'WHL-FR-304',
        'Material': 'Aleación de Magnesio',
        'Peso (kg)': 12,
        'Dimensiones': '18" x 8.5"',
        'Fabricante': 'WheelPros'
    },
    'wheel_rear_left': {
        'ID de Pieza': 'WHL-RL-305',
        'Material': 'Aleación de Magnesio',
        'Peso (kg)': 12,
        'Dimensiones': '18" x 8.5"',
        'Fabricante': 'WheelPros'
    },
    'wheel_rear_right': {
        'ID de Pieza': 'WHL-RR-306',
        'Material': 'Aleación de Magnesio',
        'Peso (kg)': 12,
        'Dimensiones': '18" x 8.5"',
        'Fabricante': 'WheelPros'
    },
    'brake_caliper_front_left': {
        'ID de Pieza': 'BC-FL-772',
        'Material': 'Hierro Dúctil',
        'Peso (kg)': 4.5,
        'Tipo': '4 pistones',
        'Proveedor': 'StopFast Brakes'
    },
    'glass_windshield': {
        'ID de Pieza': 'GLS-WND-001',
        'Material': 'Vidrio Laminado Acústico',
        'Peso (kg)': 15,
        'Proveedor': 'SafeGlass Corp.',
        'Características': 'Filtro UV, Sensor de lluvia integrado'
    },
    'exhaust_system': {
        'ID de Pieza': 'EXH-SYS-019',
        'Material': 'Acero Inoxidable 304',
        'Peso (kg)': 25,
        'Fabricante': 'FlowMax',
        'Nivel de Ruido (dB)': '85'
    },
    'steering_wheel': {
        'ID de Pieza': 'STR-WHL-007',
        'Material': 'Cuero y Aluminio',
        'Peso (kg)': 2.5,
        'Características': 'Controles multifunción, Airbag'
    },
    'dashboard': {
        'ID de Pieza': 'DASH-001',
        'Material': 'Polímero ABS',
        'Peso (kg)': 18,
        'Acabado': 'Textura suave al tacto'
    },
    'paint_main_body': {
        'ID de Pieza': 'PNT-MB-01',
        'Color': 'Blanco Perlado',
        'Tipo': 'Tricapa',
        'Código de Color': '#FDFDFD',
        'Proveedor': 'ColorLux'
    },
    'wheel': {
        'ID de Pieza': 'WHL-GEN-001',
        'Material': 'Aleación',
        'Fabricante': 'WheelPros'
    },
    'seat': {
        'ID de Pieza': 'SEAT-GEN-001',
        'Material': 'Tela y Espuma',
        'Proveedor': 'ComfortRide Inc.'
    },
    'brake_caliper': {
        'ID de Pieza': 'BC-GEN-001',
        'Material': 'Hierro Dúctil',
        'Proveedor': 'StopFast Brakes'
    }
};

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
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-bold">Piezas del Modelo</h3>
                            <div id="visor3d-controls" class="flex items-center gap-2">
                                <button id="transparency-btn" class="visor3d-control-btn" title="Vista Interior"><i data-lucide="zoom-in"></i></button>
                                <button id="explode-btn" class="visor3d-control-btn" title="Vista explosionada"><i data-lucide="move-3d"></i></button>
                                <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                            </div>
                        </div>
                        <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                    </div>
                    <div id="visor3d-parts-list">
                        <p class="text-sm text-slate-500 p-4">La lista de piezas aparecerá aquí.</p>
                    </div>
                </div>
                <div id="visor3d-piece-card">
                    <div class="flex justify-between items-center mb-2">
                        <h4 id="piece-card-title" class="text-xl font-bold">Título de la Pieza</h4>
                        <button id="close-card-btn" class="p-1 leading-none rounded-full hover:bg-slate-200" title="Cerrar"><i data-lucide="x" class="h-4 w-4"></i></button>
                    </div>
                    <div id="piece-card-details" class="text-sm space-y-1.5">
                        <!-- Characteristics will be populated here -->
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

    // Camera - Adjusted clipping planes for large models and close-up zoom
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.01, 5000);
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
    // Deselect previous object
    if (selectedObject && originalMaterial) {
        selectedObject.material = originalMaterial;
    }
    selectedObject = null;
    originalMaterial = null;

    const pieceCard = document.getElementById('visor3d-piece-card');
    if (!objectToSelect || !objectToSelect.isMesh) {
        if (pieceCard) pieceCard.classList.remove('visible');
        return;
    }

    // Select new object
    selectedObject = objectToSelect;
    originalMaterial = objectToSelect.material;

    // Create a generic highlight material
    const highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000, // Highlight in red
        emissive: 0x330000,
        metalness: 0.8,
        roughness: 0.5
    });

    // Apply highlight, skipping multi-material objects to prevent errors
    if (!Array.isArray(originalMaterial)) {
        objectToSelect.material = highlightMaterial;
    }

    const pieceTitle = document.getElementById('piece-card-title');
    const detailsContainer = document.getElementById('piece-card-details');

    if (pieceCard && pieceTitle && detailsContainer) {
        const partName = objectToSelect.name;
        const displayName = partName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        pieceTitle.textContent = displayName;

        // Robust characteristics lookup
        let characteristics = partCharacteristics[partName];
        if (!characteristics) {
            const genericName = partName.split('_')[0]; // e.g., "wheel_front_left" -> "wheel"
            characteristics = partCharacteristics[genericName];
        }

        if (characteristics) {
            detailsContainer.innerHTML = Object.entries(characteristics).map(([key, value]) => {
                return `<div class="flex justify-between py-1 border-b border-slate-200">
                            <span class="font-semibold text-slate-500">${key}:</span>
                            <span class="text-right text-slate-700">${value}</span>
                        </div>`;
            }).join('');
        } else {
            // Fallback to at least show the name if no info is found
            detailsContainer.innerHTML = `
                <div class="flex justify-between py-1 border-b border-slate-200">
                    <span class="font-semibold text-slate-500">Nombre:</span>
                    <span class="text-right text-slate-700">${displayName}</span>
                </div>
                <p class="text-slate-400 italic py-2 mt-2">No hay más información detallada disponible.</p>
            `;
        }

        pieceCard.classList.add('visible');
    }
}

function onPointerDown(event) {
    // Hide piece card on any new click to start fresh
    const pieceCard = document.getElementById('visor3d-piece-card');
    if (pieceCard) pieceCard.classList.remove('visible');

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
        let targetObject = null;

        if (isTransparent) {
            // In Lupa Mode, we want to ignore the transparent exterior and select what's behind it.
            const exteriorMeshes = new Set(exteriorMaterials.map(item => item.mesh));
            for (const intersection of intersects) {
                if (!exteriorMeshes.has(intersection.object)) {
                    targetObject = intersection.object;
                    break; // We found the first internal part, so we stop.
                }
            }
        } else {
            // In normal mode, we select the first object we hit.
            targetObject = intersects[0].object;
        }

        // Select the object if it's a valid, named mesh.
        if (targetObject && targetObject.isMesh && targetObject.name) {
            selectObject(targetObject);
        } else {
            selectObject(null);
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


function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const transparencyBtn = document.getElementById('transparency-btn');
    const partsList = document.getElementById('visor3d-parts-list');
    const closeCardBtn = document.getElementById('close-card-btn');

    if (closeCardBtn) {
        closeCardBtn.addEventListener('click', () => {
            const pieceCard = document.getElementById('visor3d-piece-card');
            if (pieceCard) {
                pieceCard.classList.remove('visible');
            }
            // Also deselect the object
            selectObject(null);
        });
    }

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
                    selectObject(partToSelect);
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
}

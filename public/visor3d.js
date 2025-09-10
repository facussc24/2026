import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/GLTFLoader.js';

// Visor3D Module
let scene, camera, renderer, controls;

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
                <div id="visor3d-scene-container"></div>
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
        console.log("Cleaning up Visor3D view.");
        document.body.classList.remove('visor3d-active');
        if (renderer) {
            renderer.dispose();
        }
        window.removeEventListener('resize', onWindowResize);
    };
}

function initThreeScene() {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

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

    // Placeholder Cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x007bff });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

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

function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    const resetBtn = document.getElementById('reset-view-btn');
    const helpBtn = document.getElementById('visor3d-help-btn');

    if (explodeBtn) {
        explodeBtn.addEventListener('click', () => {
            console.log('Explode view clicked');
            // Placeholder for explode logic
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (controls) {
                controls.reset();
            }
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

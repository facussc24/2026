document.addEventListener('DOMContentLoaded', () => {
    // --- Early exit if Three.js or dependencies are not loaded ---
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.error('Dependencias de Three.js no cargadas: Three.js, OrbitControls, o GLTFLoader. Revisa los scripts en index.html.');
        return;
    }

    // --- MOCK DATA (Simulating Firestore) ---
    const mockModelData = [
        {
            id: "maxus_t90_1",
            nombre: "Maxus T90",
            archivo_glb: "modelos/maxus_t90.glb",
            piezas: {
                "Mesh_Motor_Diesel": {
                    titulo: "Motor 2.0L Bi-Turbo Diesel",
                    descripcion: "Motor diésel de última generación con doble turbo que proporciona una excelente combinación de potencia y eficiencia de combustible.",
                    specs: ["Potencia: 215 HP", "Torque: 500 Nm", "Cilindrada: 1,996 cm³", "Norma: Euro 6"]
                },
                "Mesh_Chasis_Reforzado": {
                    titulo: "Chasis de Escalera Reforzado",
                    descripcion: "Construido para durar, el chasis de tipo escalera proporciona una base sólida y resistente para la carrocería.",
                    specs: ["Material: Acero de alta resistencia", "Tipo: Doble viga longitudinal", "Protección: Tratamiento anticorrosión"]
                }
            }
        },
        {
            id: "otro_modelo_2",
            nombre: "Otro Modelo (Ejemplo)",
            archivo_glb: "modelos/otro_modelo.glb", // Note: this file doesn't exist, clicking will cause a 404
            piezas: { "Pieza_Ejemplo": { titulo: "Pieza de Ejemplo", descripcion: "Descripción de la pieza.", specs: ["Spec 1"] } }
        }
    ];

    // --- Global Variables ---
    let scene, camera, renderer, controls, raycaster, mouse;
    let currentModelGroup = new THREE.Group();
    let currentModelPieces = {};

    // --- DOM Elements ---
    const container = document.getElementById('canvas-container');
    const modelSelector = document.getElementById('model-selector');
    const infoPanel = document.getElementById('info-panel');
    const infoPanelTitle = document.getElementById('info-panel-title');
    const infoPanelDesc = document.getElementById('info-panel-desc');
    const infoPanelSpecs = document.getElementById('info-panel-specs');
    const infoPanelCloseBtn = document.getElementById('info-panel-close-btn');

    // --- Main Initializer ---
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        scene.add(currentModelGroup);

        camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.5, 4);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        window.addEventListener('resize', onWindowResize);
        container.addEventListener('click', onCanvasClick);
        infoPanelCloseBtn.addEventListener('click', hideInfoPanel);

        animate();
        populateModelSelector();
    }

    function populateModelSelector() {
        const models = mockModelData;
        modelSelector.innerHTML = '';
        models.forEach(model => {
            const button = document.createElement('button');
            button.className = 'px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors';
            button.innerText = model.nombre;
            button.addEventListener('click', () => loadModel(model.archivo_glb, model.piezas));
            modelSelector.appendChild(button);
        });
    }

    function showInfoPanel(pieceData) {
        infoPanelTitle.innerText = pieceData.titulo;
        infoPanelDesc.innerText = pieceData.descripcion;
        infoPanelSpecs.innerHTML = '';
        pieceData.specs.forEach(spec => {
            const li = document.createElement('li');
            li.innerText = spec;
            infoPanelSpecs.appendChild(li);
        });
        infoPanel.classList.remove('hidden');
    }

    function hideInfoPanel() {
        infoPanel.classList.add('hidden');
    }

    function loadModel(glbPath, piecesData) {
        while (currentModelGroup.children.length > 0) {
            currentModelGroup.remove(currentModelGroup.children[0]);
        }
        currentModelPieces = {};

        const loader = new THREE.GLTFLoader();
        loader.load(glbPath, (gltf) => {
            const model = gltf.scene;
            currentModelGroup.add(model);
            currentModelPieces = piecesData;
            console.log(`Modelo ${glbPath} cargado.`);
        }, undefined, (error) => {
            console.error(`Error cargando el modelo ${glbPath}:`, error);
            // alert(`No se pudo cargar el modelo: ${glbPath}. Revisa la consola para más detalles.`);
        });
    }

    function onWindowResize() {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        }
    }

    function onCanvasClick(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(currentModelGroup.children, true);

        if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;
            const pieceName = intersectedObject.name;
            if (currentModelPieces[pieceName]) {
                showInfoPanel(currentModelPieces[pieceName]);
            } else {
                console.warn(`Pieza clickeada "${pieceName}" no encontrada en los datos del modelo.`);
            }
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    if (container && modelSelector && infoPanel) {
        init();
    } else {
        console.error("No se encontraron los elementos HTML esenciales (canvas-container, model-selector, o info-panel).");
    }
});

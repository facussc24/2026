import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import TWEEN from '@tweenjs/tween.js';
import { state, modelParts, partCharacteristics, selectedObjects, clippingPlanes } from '../visor3d.js';
import { renderPartsList, updateStatus } from './uiManager.js';
import { initGizmo } from './navigationGizmo.js';

export let scene, camera, renderer, controls, labelRenderer, composer;
let ambientLight, directionalLight, hemisphereLight;
let fxaaPass;
let gizmoUpdater;
let planeObjects;

const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.1,
    roughness: 0.75,
});

const backFaceMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    side: THREE.BackSide,
});

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x404040);
}

function setupCamera(container) {
    // Adjusted near and far planes to improve depth buffer precision and reduce Z-fighting.
    camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 2000);
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
    // Increased intensity for a brighter default scene
    ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    // Increased intensity for a stronger key light
    directionalLight = new THREE.DirectionalLight(0xffffff, 3.5);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    const shadowCamSize = 15;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.bias = -0.0005;
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, -5, -7.5);
    scene.add(fillLight);

    // Increased intensity for a softer fill light from below
    hemisphereLight = new THREE.HemisphereLight(0xeeeeff, 0x444488, 1.5);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);
}

export function initThreeScene(modelUrl, onPointerDown) {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

    container.innerHTML = '';
    updateStatus('Cargando modelo 3D...', false, true);

    setupScene();
    setupCamera(container);
    setupRenderer(container);
    setupControls(camera, renderer);
    setupLights(scene);

    planeObjects = new THREE.Group();
    scene.add(planeObjects);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.offsetWidth, container.offsetHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    const loader = new GLTFLoader();
    loader.load(modelUrl,
    (gltf) => {
        const progressBar = document.getElementById('visor3d-progress-bar');
        if (progressBar) progressBar.style.width = '100%';
        updateStatus('Procesando modelo...', false, true);
        const model = gltf.scene;

        const modelCamera = model.getObjectByProperty('type', 'PerspectiveCamera');
        if (modelCamera) {
            modelCamera.parent.remove(modelCamera);
        }

        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Set the default environment
        setEnvironment('royal_esplanade_1k.hdr');

        const centeredBox = new THREE.Box3().setFromObject(model);
        const groundY = centeredBox.min.y;

        // Solid grey floor plane instead of a grid
        const floorGeometry = new THREE.PlaneGeometry(200, 200);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080, // A mid-grey color
            metalness: 0.1,
            roughness: 0.8
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = groundY;
        floor.receiveShadow = true; // The floor should receive shadows
        scene.add(floor);

        const size = box.getSize(new THREE.Vector3());
        if (size.x === 0 && size.y === 0 && size.z === 0) {
            updateStatus("Error: El modelo está vacío o no es visible.", true);
            return;
        }

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = (maxDim / 2) / Math.tan(fov / 2);

        // Position the camera relative to the model's new center at the origin.
        const cameraZ = cameraDistance * 1.2;
        const cameraY = maxDim / 4;
        camera.position.set(0, cameraY, cameraZ);

        const lookAtVector = new THREE.Vector3(0, 0, 0);
        camera.lookAt(lookAtVector);
        if (controls) {
            controls.target.copy(lookAtVector);
            controls.update();
        }

        modelParts.length = 0;
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
        updateStatus(null);
    },
    (xhr) => {
        if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            const progressBar = document.getElementById('visor3d-progress-bar');
            if (progressBar) progressBar.style.width = percentComplete + '%';
            updateStatus(`Cargando modelo: ${Math.round(percentComplete)}%`, false, true);
        }
    },
    (error) => {
        console.error('An error happened while loading the model:', error);
        updateStatus('Error: No se pudo cargar el modelo 3D.', true);
    });

    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    renderPass.clear = false; // We will handle clearing manually for the stencil effect.
    composer.addPass(renderPass);

    state.outlinePass = new OutlinePass(new THREE.Vector2(container.offsetWidth, container.offsetHeight), scene, camera);
    state.outlinePass.edgeStrength = 5;
    state.outlinePass.edgeGlow = 0.5;
    state.outlinePass.edgeThickness = 1;
    state.outlinePass.visibleEdgeColor.set('#007bff');
    state.outlinePass.hiddenEdgeColor.set('#007bff');
    composer.addPass(state.outlinePass);

    // Add SSAO Pass for ambient occlusion
    const ssaoPass = new SSAOPass(scene, camera, container.offsetWidth, container.offsetHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    composer.addPass(ssaoPass);

    // Add Gamma Correction Pass
    const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
    composer.addPass(gammaCorrectionPass);

    fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (container.offsetWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (container.offsetHeight * pixelRatio);
    composer.addPass(fxaaPass);

    gizmoUpdater = initGizmo(renderer, camera, controls);

    // Add a big plane to represent the cap
    const planeGeom = new THREE.PlaneGeometry(100, 100);
    const capPlane = new THREE.Mesh(planeGeom, capMaterial);
    capPlane.rotation.x = -Math.PI / 2; // Start it flat
    planeObjects.add(capPlane);


    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        TWEEN.update();

        // This ensures the main scene is always rendered correctly before the gizmo.
        renderer.setScissorTest(false);

        // Handle simple clipping without stencils
        renderer.localClippingEnabled = state.isClipping;

        composer.render();
        if (labelRenderer) labelRenderer.render(scene, camera);

        // Enable scissor test only for the gizmo rendering part.
        renderer.setScissorTest(true);
        if (gizmoUpdater) {
            gizmoUpdater.update();
        }
    }
    animate();

    window.addEventListener('resize', onWindowResize, false);

    return () => {
        console.log("Cleaning up Visor3D scene.");
        if (renderer) renderer.dispose();
        if (labelRenderer && labelRenderer.domElement.parentNode) {
            labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
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
        if (labelRenderer) labelRenderer.setSize(width, height);
        composer.setSize(width, height);
        const pixelRatio = renderer.getPixelRatio();
        fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
        fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
}

export function zoomToSelection() {
    if (selectedObjects.length === 0) return;
    const object = selectedObjects[0];
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = (maxDim / 1.5) / Math.tan(fov / 2);

    new TWEEN.Tween(camera.position)
        .to({ x: center.x, y: center.y + size.y / 2, z: center.z + cameraDistance }, 800)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(controls.target)
        .to(center, 800)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => camera.lookAt(controls.target))
        .start();
}

export function updateClippingPlane(activeClipAxis, clipPosition) {
    if (!state.isClipping) return;

    const normals = {
        x: new THREE.Vector3(-1, 0, 0),
        y: new THREE.Vector3(0, -1, 0),
        z: new THREE.Vector3(0, 0, -1)
    };

    const normal = normals[activeClipAxis];
    clippingPlanes[0].normal.copy(normal);
    clippingPlanes[0].constant = parseFloat(clipPosition);

    const capPlane = planeObjects.children[0];
    if (capPlane) {
        // Position the cap plane at the clipping plane's position
        capPlane.position.copy(normal).multiplyScalar(-clippingPlanes[0].constant);
        // Align the cap plane with the clipping plane's normal
        capPlane.lookAt(capPlane.position.clone().add(normal));
        capPlane.updateMatrixWorld(true);
    }
}

export function setBackgroundColor(color) {
    if (scene) {
        scene.background.set(color);
    }
}

export function setSunIntensity(intensity) {
    if (directionalLight) {
        directionalLight.intensity = parseFloat(intensity);
    }
}

export function setEnvironment(hdrFile) {
    if (!renderer || !scene) return;

    new RGBELoader()
        .setPath('modulos/visor3d/imagenes/')
        .load(hdrFile, (texture) => {
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            pmremGenerator.compileEquirectangularShader();

            const envMap = pmremGenerator.fromEquirectangular(texture).texture;

            scene.background = envMap;
            scene.environment = envMap;

            texture.dispose();
            pmremGenerator.dispose();
            console.log(`Environment changed to ${hdrFile}`);
        }, undefined, (error) => {
            console.error(`An error occurred while loading the HDR environment map: ${hdrFile}`, error);
            scene.background = new THREE.Color(0x404040);
            scene.environment = null;
            // Boost existing lights as a fallback
            if (ambientLight) ambientLight.intensity = 2.5;
            if (directionalLight) directionalLight.intensity = 4.0;
            if (hemisphereLight) hemisphereLight.intensity = 1.5;
        });
}

export function setAmbientLightIntensity(intensity) {
    if (ambientLight) {
        ambientLight.intensity = parseFloat(intensity);
    }
}

export function toggleWireframe(isActive) {
    modelParts.forEach(part => {
        const applyWireframe = (material) => {
            material.wireframe = isActive;
        };

        if (Array.isArray(part.material)) {
            part.material.forEach(applyWireframe);
        } else if (part.material) {
            applyWireframe(part.material);
        }
    });
}


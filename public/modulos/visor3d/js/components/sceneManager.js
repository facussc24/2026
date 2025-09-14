import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import TWEEN from '@tweenjs/tween.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { state, modelParts, partCharacteristics, selectedObjects, clippingPlanes } from '../visor3d.js';
import { renderPartsList, updateStatus } from './uiManager.js';

export let scene, camera, renderer, controls, labelRenderer;
let ambientLight, directionalLight;
let composer, fxaaPass;
let gizmoScene, gizmoCamera;

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
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
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

    const hemisphereLight = new THREE.HemisphereLight(0xeeeeff, 0x444488, 0.4);
    hemisphereLight.position.set(0, 20, 0);
    scene.add(hemisphereLight);
}

export function initThreeScene(modelId, onPointerDown) {
    const container = document.getElementById('visor3d-scene-container');
    if (!container) return;

    container.innerHTML = '';
    updateStatus('Cargando modelo 3D...', false, true);

    setupScene();
    setupCamera(container);
    setupRenderer(container);
    setupControls(camera, renderer);
    setupLights(scene);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.offsetWidth, container.offsetHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(labelRenderer.domElement);

    const loader = new GLTFLoader();
    loader.load(`modulos/visor3d/modelos/${modelId}/model.glb`,
    (gltf) => {
        updateStatus('Procesando modelo...');
        const model = gltf.scene;

        const modelCamera = model.getObjectByProperty('type', 'PerspectiveCamera');
        if (modelCamera) {
            modelCamera.parent.remove(modelCamera);
        }

        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        new RGBELoader()
            .setPath('modulos/visor3d/imagenes/')
            .load('studio_small_03_1k.hdr', function (texture) {
                const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                pmremGenerator.dispose();
                scene.environment = envMap;
                scene.background = new THREE.Color(0x404040);
            }, undefined, () => {
                console.error("Failed to load HDR environment map.");
                updateStatus("Error: No se pudo cargar el mapa de entorno.", true);
            });

        const centeredBox = new THREE.Box3().setFromObject(model);
        const groundY = centeredBox.min.y;

        const grid = new THREE.GridHelper(200, 40, 0x888888, 0x888888);
        grid.material.opacity = 0.3;
        grid.material.transparent = true;
        grid.position.y = groundY;
        scene.add(grid);

        const shadowPlaneGeo = new THREE.PlaneGeometry(200, 200);
        const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.5 });
        const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = groundY + 0.01;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        const size = box.getSize(new THREE.Vector3());
        if (size.x === 0 && size.y === 0 && size.z === 0) {
            updateStatus("Error: El modelo está vacío o no es visible.", true);
            return;
        }

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = (maxDim / 2) / Math.tan(fov / 2);
        const cameraZ = center.z + cameraDistance * 1.2;
        const cameraY = center.y + maxDim / 4;
        camera.position.set(center.x, cameraY, cameraZ);

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

    initAxisGizmo();

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        TWEEN.update();

        if (state.isIsolated) {
            const isolatedUuids = new Set(state.isolatedObjects.map(obj => obj.uuid));
            modelParts.forEach(part => {
                const shouldBeVisible = isolatedUuids.has(part.uuid);
                if (part.visible !== shouldBeVisible) {
                    part.visible = shouldBeVisible;
                }
            });
        }

        // render main scene
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissorTest(true);

        composer.render();
        if (labelRenderer) labelRenderer.render(scene, camera);

        // render gizmo
        if (gizmoCamera) {
            const gizmoContainer = document.getElementById('axis-gizmo-container');
            const { left, bottom, width, height } = gizmoContainer.getBoundingClientRect();
            const { innerWidth, innerHeight } = window;
            renderer.setScissor(left, innerHeight - bottom, width, height);
            renderer.setViewport(left, innerHeight - bottom, width, height);

            gizmoCamera.position.copy(camera.position);
            gizmoCamera.quaternion.copy(camera.quaternion);
            renderer.render(gizmoScene, gizmoCamera);
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

    clippingPlanes[0].normal.copy(normals[activeClipAxis]);
    clippingPlanes[0].constant = parseFloat(clipPosition);

    const helper = scene.getObjectByName('clipping-plane-helper');
    if (helper) {
        helper.plane = clippingPlanes[0];
        helper.updateMatrixWorld(true);
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

export function setAmbientLightIntensity(intensity) {
    if (ambientLight) {
        ambientLight.intensity = parseFloat(intensity);
    }
}

function initAxisGizmo() {
    gizmoScene = new THREE.Scene();
    const gizmoContainer = document.getElementById('axis-gizmo-container');
    gizmoCamera = new THREE.PerspectiveCamera(75, gizmoContainer.offsetWidth / gizmoContainer.offsetHeight, 0.1, 50);
    gizmoCamera.position.set(0, 0, 5);

    const axesHelper = new THREE.AxesHelper(5);
    gizmoScene.add(axesHelper);
}

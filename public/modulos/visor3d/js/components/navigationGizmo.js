import * as THREE from 'three';
import TWEEN from 'https://cdn.jsdelivr.net/npm/@tweenjs/tween.js@25.0.0/dist/tween.esm.js';

let gizmoScene, gizmoCamera, gizmoRenderer;
const gizmoSize = 100;

export function initGizmo(mainRenderer, mainCamera, mainControls) {
    const container = document.getElementById('axis-gizmo-container');
    if (!container) return;

    // Use a separate renderer to avoid interfering with the main scene's state
    gizmoRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    gizmoRenderer.setSize(gizmoSize, gizmoSize);
    gizmoRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(gizmoRenderer.domElement);

    gizmoScene = new THREE.Scene();
    gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    gizmoCamera.position.set(0, 0, 3);

    // Create the navigation cube
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const faceMaterials = createFaceMaterials();
    const cube = new THREE.Mesh(cubeGeo, faceMaterials);
    gizmoScene.add(cube);

    // Add click listener
    gizmoRenderer.domElement.addEventListener('click', (event) => onGizmoClick(event, mainCamera, mainControls));

    return {
        update: () => {
            // Sync gizmo camera with the main camera
            const quat = mainCamera.quaternion.clone().invert();
            gizmoCamera.quaternion.copy(quat);
            gizmoRenderer.render(gizmoScene, gizmoCamera);
        }
    };
}

function createFaceMaterials() {
    const faces = {
        'RIGHT': '+X', 'LEFT': '-X',
        'TOP': '+Y', 'BOTTOM': '-Y',
        'FRONT': '+Z', 'BACK': '-Z'
    };
    return Object.keys(faces).map(key => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ccc';
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = '#333';
        context.font = 'bold 48px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(faces[key], 64, 64);
        return new THREE.CanvasTexture(canvas);
    });
}

function onGizmoClick(event, camera, controls) {
    const rect = gizmoRenderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, gizmoCamera);
    const intersects = raycaster.intersectObjects(gizmoScene.children, true);

    if (intersects.length > 0 && intersects[0].face) {
        const faceNormal = intersects[0].face.normal.clone();
        // Transform the normal from the gizmo's local space to world space
        const cube = intersects[0].object;
        faceNormal.transformDirection(cube.matrixWorld);

        const distance = camera.position.distanceTo(controls.target);
        const newCameraPosition = controls.target.clone().add(faceNormal.multiplyScalar(distance));

        new TWEEN.Tween(camera.position)
            .to(newCameraPosition, 500)
            .easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => {
                // Keep looking at the target during the animation
                camera.lookAt(controls.target);
            })
            .start();

        // Also tween the controls target if needed, but for simple orbit it's not necessary.
        // It's important that the controls are updated after the tween.
        new TWEEN.Tween(controls.target)
            .to(controls.target, 500) // No change in target, just to sync updates
            .onUpdate(() => controls.update())
            .start();
    }
}
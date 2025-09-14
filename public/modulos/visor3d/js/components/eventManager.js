import * as THREE from 'three';
import { state, modelParts, selectedObjects, transparentMaterials, originalPositions, explosionVectors, measurementPoints, measurementLine, measurementLabel, clippingPlanes } from '../visor3d.js';
import { camera, renderer, controls, zoomToSelection, updateClippingPlane, setBackgroundColor, setSunIntensity, setAmbientLightIntensity, scene } from './sceneManager.js';
import { updateSelectionUI, toggleButtonActive, toggleExplodeControls, toggleClippingControls, updateIsolationButton } from './uiManager.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let activeClipAxis = 'x';

export function onPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersectableObjects = modelParts.length > 0 ? modelParts : scene.children;
    const intersects = raycaster.intersectObjects(intersectableObjects, true);

    let targetObject = null;
    if (intersects.length > 0) {
        const firstVisibleHit = intersects.find(hit => hit.object.visible && hit.object.isMesh);
        if (firstVisibleHit) targetObject = firstVisibleHit.object;
    }

    if (state.isMeasuring) {
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            measurementPoints.push(pt);
            updateMeasurementVisuals();
        }
    } else {
        if (!targetObject && !event.ctrlKey) {
            updateSelection(null, false);
        } else if (targetObject && targetObject.name) {
            updateSelection(targetObject, event.ctrlKey);
        }
    }
}

export function updateSelection(objectToSelect, isCtrlPressed) {
    if (!isCtrlPressed) {
        selectedObjects.length = 0;
        if (objectToSelect && objectToSelect.isMesh) {
            selectedObjects.push(objectToSelect);
        }
    } else {
        if (objectToSelect && objectToSelect.isMesh) {
            const index = selectedObjects.findIndex(obj => obj.uuid === objectToSelect.uuid);
            if (index > -1) {
                selectedObjects.splice(index, 1);
            } else {
                selectedObjects.push(objectToSelect);
            }
        }
    }

    if (state.outlinePass) {
        state.outlinePass.selectedObjects = selectedObjects;
    }

    updateSelectionUI();
    applySelectionTransparency();
}

function applySelectionTransparency(forceRestore = false) {
    if (!state.isSelectionTransparencyActive && !forceRestore) {
        if (!forceRestore) return;
    }

    const selectedUuids = new Set(selectedObjects.map(obj => obj.uuid));

    modelParts.forEach(part => {
        const isSelected = selectedUuids.has(part.uuid);
        if (state.isSelectionTransparencyActive && !isSelected && !forceRestore) {
            if (!transparentMaterials.has(part.uuid)) {
                transparentMaterials.set(part.uuid, part.material);
                const makeTransparent = (material) => {
                    const transparentMat = material.clone();
                    transparentMat.transparent = true;
                    transparentMat.opacity = 0.1;
                    transparentMat.emissive = new THREE.Color(0x000000);
                    transparentMat.depthWrite = false;
                    return transparentMat;
                };
                part.material = Array.isArray(part.material) ? part.material.map(makeTransparent) : makeTransparent(part.material);
            }
        } else {
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
    toggleButtonActive('selection-transparency-btn', state.isSelectionTransparencyActive);
    if (state.isSelectionTransparencyActive) {
        applySelectionTransparency();
    } else {
        applySelectionTransparency(true);
    }
}

function updateExplosion(factor) {
    modelParts.forEach(mesh => {
        const originalPos = originalPositions.get(mesh.uuid);
        const explosionVec = explosionVectors.get(mesh.uuid);
        if (!originalPos || !explosionVec) return;
        const offset = explosionVec.clone().multiplyScalar(factor);
        const targetPosition = new THREE.Vector3().copy(originalPos).add(offset);
        if (!mesh.position.equals(targetPosition)) {
            new TWEEN.Tween(mesh.position)
                .to(targetPosition, 300)
                .easing(TWEEN.Easing.Quadratic.Out)
                .start();
        }
    });
}

function toggleExplodeView() {
    state.isExploded = !state.isExploded;
    toggleButtonActive('explode-btn', state.isExploded);
    toggleExplodeControls(state.isExploded);

    if (state.isExploded && originalPositions.size === 0) {
        modelParts.forEach(mesh => {
            originalPositions.set(mesh.uuid, mesh.position.clone());
            const characteristics = partCharacteristics[mesh.name] || partCharacteristics[mesh.name.split('_')[0]];
            if (characteristics && characteristics.explosionVector) {
                const definedVec = characteristics.explosionVector;
                explosionVectors.set(mesh.uuid, new THREE.Vector3(definedVec[0], definedVec[1], definedVec[2]));
            } else {
                const partBox = new THREE.Box3().setFromObject(mesh);
                const partCenter = partBox.getCenter(new THREE.Vector3());
                explosionVectors.set(mesh.uuid, partCenter);
            }
        });
    }
    const factor = state.isExploded ? document.getElementById('explode-factor').value : 0;
    updateExplosion(factor);
}

export function toggleIsolation() {
    if (selectedObjects.length === 0 && !state.isIsolated) return;
    state.isIsolated = !state.isIsolated;
    toggleButtonActive('isolate-btn', state.isIsolated);
    updateIsolationButton(state.isIsolated);

    if (state.isIsolated) {
        state.preIsolationVisibility.clear();
        modelParts.forEach(part => state.preIsolationVisibility.set(part.uuid, part.visible));
        state.isolatedObjects = [...selectedObjects];
        const isolatedUuids = new Set(state.isolatedObjects.map(obj => obj.uuid));
        modelParts.forEach(part => part.visible = isolatedUuids.has(part.uuid));
    } else {
        state.isolatedObjects = [];
        modelParts.forEach(part => part.visible = state.preIsolationVisibility.has(part.uuid) ? state.preIsolationVisibility.get(part.uuid) : true);
        state.preIsolationVisibility.clear();
    }
}

function toggleClippingView() {
    state.isClipping = !state.isClipping;
    toggleButtonActive('clipping-btn', state.isClipping);
    toggleClippingControls(state.isClipping);

    if (state.isClipping) {
        renderer.clippingPlanes = clippingPlanes;
        const planeHelper = new THREE.PlaneHelper(clippingPlanes[0], 5, 0x00ff00);
        planeHelper.name = 'clipping-plane-helper';
        scene.add(planeHelper);
    } else {
        renderer.clippingPlanes = [];
        const helper = scene.getObjectByName('clipping-plane-helper');
        if (helper) scene.remove(helper);
    }
}

export function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    if (explodeBtn) explodeBtn.addEventListener('click', toggleExplodeView);

    const isolateBtn = document.getElementById('isolate-btn');
    if (isolateBtn) isolateBtn.addEventListener('click', toggleIsolation);

    const selectionTransparencyBtn = document.getElementById('selection-transparency-btn');
    if (selectionTransparencyBtn) selectionTransparencyBtn.addEventListener('click', toggleSelectionTransparency);

    const clippingBtn = document.getElementById('clipping-btn');
    if (clippingBtn) clippingBtn.addEventListener('click', toggleClippingView);

    const measureBtn = document.getElementById('measure-btn');
    if (measureBtn) measureBtn.addEventListener('click', toggleMeasurement);

    const zoomBtn = document.getElementById('zoom-to-part-btn');
    if (zoomBtn) zoomBtn.addEventListener('click', zoomToSelection);

    const explodeFactor = document.getElementById('explode-factor');
    if (explodeFactor) explodeFactor.addEventListener('input', (e) => {
        if(state.isExploded) updateExplosion(e.target.value);
    });

    const bgColor = document.getElementById('bg-color');
    if (bgColor) bgColor.addEventListener('input', (e) => setBackgroundColor(e.target.value));

    const sunIntensity = document.getElementById('sun-intensity');
    if (sunIntensity) sunIntensity.addEventListener('input', (e) => setSunIntensity(e.target.value));

    const ambientLight = document.getElementById('ambient-light');
    if (ambientLight) ambientLight.addEventListener('input', (e) => setAmbientLightIntensity(e.target.value));

    const searchInput = document.getElementById('visor3d-search');
    if (searchInput) searchInput.addEventListener('keyup', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const partsListItems = document.querySelectorAll('#visor3d-parts-list li');
        const highlightedObjects = [];
        partsListItems.forEach(li => {
            const partName = li.dataset.partName.toLowerCase();
            const isMatch = partName.includes(searchTerm);
            li.style.display = isMatch ? 'flex' : 'none';
            if (isMatch && searchTerm.length > 0) {
                const part = modelParts.find(p => p.name.toLowerCase() === partName);
                if (part) highlightedObjects.push(part);
            }
        });
        if (state.outlinePass) {
            state.outlinePass.selectedObjects = searchTerm.length > 0 ? highlightedObjects : selectedObjects;
        }
    });

    const clippingAxisButtons = document.getElementById('clipping-axis-buttons');
    if (clippingAxisButtons) clippingAxisButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('#clipping-axis-buttons button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            activeClipAxis = e.target.dataset.axis;
            updateClippingPlane(activeClipAxis, document.getElementById('clipping-position').value);
        }
    });

    const clippingPosition = document.getElementById('clipping-position');
    if (clippingPosition) clippingPosition.addEventListener('input', (e) => {
        updateClippingPlane(activeClipAxis, e.target.value);
    });

    const partsList = document.getElementById('visor3d-parts-list');
    if (partsList) partsList.addEventListener('click', (e) => {
        const listItem = e.target.closest('li[data-part-name]');
        if (!listItem) return;
        const partName = listItem.dataset.partName;
        const partToAffect = modelParts.find(p => p.name === partName);
        if (!partToAffect) return;

        const actionButton = e.target.closest('button[data-action]');
        if (actionButton && actionButton.dataset.action === 'toggle-visibility') {
            partToAffect.visible = !partToAffect.visible;
            const icon = actionButton.querySelector('i');
            icon.setAttribute('data-lucide', partToAffect.visible ? 'eye' : 'eye-off');
            lucide.createIcons();
        } else {
            updateSelection(partToAffect, e.ctrlKey);
        }
    });

    const resetBtn = document.getElementById('reset-view-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        if (state.isMeasuring) toggleMeasurement();
        if (state.isExploded) toggleExplodeView();
        if (state.isSelectionTransparencyActive) toggleSelectionTransparency();
        if (state.isIsolated) toggleIsolation();
        if (state.isClipping) toggleClippingView();

        modelParts.forEach(part => { part.visible = true; });
        document.querySelectorAll('#visor3d-parts-list button[data-action="toggle-visibility"] i').forEach(icon => {
            icon.setAttribute('data-lucide', 'eye');
            lucide.createIcons();
        });

        if (controls) controls.reset();
        updateSelection(null, false);
    });
}

function toggleMeasurement() {
    state.isMeasuring = !state.isMeasuring;
    toggleButtonActive('measure-btn', state.isMeasuring);

    if (!state.isMeasuring) {
        // Clear points and visuals when turning off
        measurementPoints.length = 0;
        updateMeasurementVisuals();
    }
}

export function updateMeasurementVisuals() {
    // Remove existing line and label
    if (measurementLine) {
        scene.remove(measurementLine);
        measurementLine.geometry.dispose();
        measurementLine.material.dispose();
        measurementLine = null;
    }
    if (measurementLabel) {
        scene.remove(measurementLabel);
        measurementLabel = null;
    }

    if (measurementPoints.length === 2) {
        const [p1, p2] = measurementPoints;

        // Create line
        const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        measurementLine = new THREE.Line(geometry, material);
        scene.add(measurementLine);

        // Create label
        const distance = p1.distanceTo(p2);
        const text = document.createElement('div');
        text.className = 'visor3d-measurement-label';
        text.textContent = `${distance.toFixed(2)} units`;

        measurementLabel = new CSS2DObject(text);
        measurementLabel.position.lerpVectors(p1, p2, 0.5);
        scene.add(measurementLabel);

        // Reset for next measurement
        measurementPoints.length = 0;
    }
}

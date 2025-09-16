import * as THREE from 'three';
import { state, modelParts, selectedObjects, transparentMaterials, originalPositions, explosionVectors, measurementPoints, clippingPlanes, partCharacteristics, measurementState } from '../visor3d.js';
import { camera, renderer, controls, zoomToSelection, updateClippingPlane, setSunIntensity, setAmbientLightIntensity, scene, composer } from './sceneManager.js';
import { updateSelectionUI, toggleButtonActive, toggleExplodeControls, toggleClippingControls, updateIsolationButton, createReportModal } from './uiManager.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

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
    } else if (state.isAnnotationMode) {
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            createAnnotationAtPoint(pt);
        }
    } else {
        if (!targetObject && !event.ctrlKey && !state.isSelectionLocked) {
            updateSelection(null, false);
        } else if (targetObject && targetObject.name) {
            updateSelection(targetObject, event.ctrlKey);
        }
    }
}

export function toggleSelectionLock() {
    state.isSelectionLocked = !state.isSelectionLocked;
    toggleButtonActive('lock-selection-btn', state.isSelectionLocked);

    const lockButton = document.getElementById('lock-selection-btn');
    if (lockButton) {
        const icon = lockButton.querySelector('i');
        if (state.isSelectionLocked) {
            lockButton.setAttribute('title', 'Desbloquear Selección');
            if (icon) icon.setAttribute('data-lucide', 'unlock');
        } else {
            lockButton.setAttribute('title', 'Bloquear Selección');
            if (icon) icon.setAttribute('data-lucide', 'lock');
        }
        if (window.lucide) window.lucide.createIcons();
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

    // If the selection is cleared, unlock it.
    if (selectedObjects.length === 0 && state.isSelectionLocked) {
        toggleSelectionLock();
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
                    transparentMat.opacity = 0.2; // Increased opacity
                    transparentMat.emissive = new THREE.Color(0x000000);
                    transparentMat.depthWrite = true; // Enable depth write
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

function generateReport() {
    console.log("Iniciando la generación del reporte...");

    // Forzar un renderizado con el composer para asegurar que los efectos (como el outline) están en el buffer
    if (state.outlinePass) {
        state.outlinePass.selectedObjects = selectedObjects;
    }
    composer.render();

    // 1. Capturar la imagen del canvas
    const screenshot = renderer.domElement.toDataURL('image/png');
    if (!screenshot || screenshot === 'data:,') {
        console.error("Error al capturar la imagen del canvas. Puede que esté vacío.");
        alert("No se pudo generar la imagen del reporte. Inténtelo de nuevo.");
        return;
    }

    // 2. Obtener la lista de piezas seleccionadas
    if (selectedObjects.length === 0) {
        alert("Por favor, seleccione al menos una pieza para generar el reporte.");
        return;
    }

    // 3. Recopilar datos de las piezas (nombre, coordenadas 3D y metadatos)
    const reportData = selectedObjects.map(object => {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());

        // Los metadatos ya están disponibles en `partCharacteristics`
        const metadata = partCharacteristics[object.name] || {};

        return {
            name: object.name,
            position3d: center, // Guardamos el Vector3 completo
            metadata: metadata
        };
    });

    console.log("Datos para el reporte recopilados:", {
        screenshotLength: screenshot.length,
        parts: reportData
    });

    // Llamar a la función para crear y mostrar el modal
    createReportModal(screenshot, reportData);
}

export function setupVisor3dEventListeners() {
    const explodeBtn = document.getElementById('explode-btn');
    if (explodeBtn) explodeBtn.addEventListener('click', toggleExplodeView);

    const isolateBtn = document.getElementById('isolate-btn');
    if (isolateBtn) isolateBtn.addEventListener('click', toggleIsolation);

    const lockSelectionBtn = document.getElementById('lock-selection-btn');
    if (lockSelectionBtn) lockSelectionBtn.addEventListener('click', toggleSelectionLock);

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
            state.outlinePass.selectedObjects = searchTerm.length > 0 ? highlightedObjects : [];
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
            const iconName = partToAffect.visible ? 'eye' : 'eye-off';
            actionButton.innerHTML = `<i data-lucide="${iconName}" class="pointer-events-none"></i>`;
            lucide.createIcons();
        } else {
            updateSelection(partToAffect, e.ctrlKey);
        }
    });

    const reportBtn = document.getElementById('report-btn');
    if (reportBtn) reportBtn.addEventListener('click', generateReport);

    const resetBtn = document.getElementById('reset-view-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        if (state.isMeasuring) toggleMeasurement();
        if (state.isExploded) toggleExplodeView();
        if (state.isSelectionTransparencyActive) toggleSelectionTransparency();
        if (state.isIsolated) toggleIsolation();
        if (state.isClipping) toggleClippingView();
        if (state.isAnnotationMode) toggleAnnotationMode();
        if (state.isSelectionLocked) toggleSelectionLock();

        modelParts.forEach(part => { part.visible = true; });
        document.querySelectorAll('#visor3d-parts-list button[data-action="toggle-visibility"] i').forEach(icon => {
            icon.setAttribute('data-lucide', 'eye');
            lucide.createIcons();
        });

        if (controls) controls.reset();
        updateSelection(null, false);
    });

    const annotationBtn = document.getElementById('annotation-btn');
    if(annotationBtn) annotationBtn.addEventListener('click', toggleAnnotationMode);

    const closeAnnotationsPanelBtn = document.getElementById('close-annotations-panel-btn');
    if(closeAnnotationsPanelBtn) closeAnnotationsPanelBtn.addEventListener('click', hideAnnotationPanel);

    const addCommentBtn = document.getElementById('add-comment-btn');
    if(addCommentBtn) addCommentBtn.addEventListener('click', () => {
        const text = document.getElementById('comment-text').value;
        const panel = document.getElementById('visor3d-annotations-panel');
        const annotationId = panel.dataset.annotationId;

        if(text.trim() === '' || !annotationId) return;

        const comment = {
            userId: 'user-test-id', // Placeholder
            userName: 'Test User', // Placeholder
            text: text.trim(),
            timestamp: new Date().toISOString()
        };

        addCommentToAnnotation(annotationId, comment);
        document.getElementById('comment-text').value = '';
    });

    window.addEventListener('show-annotation', (event) => {
        showAnnotationPanel(event.detail);
    });
}

import { saveAnnotation, addCommentToAnnotation } from './annotationManager.js';

export function toggleAnnotationMode() {
    state.isAnnotationMode = !state.isAnnotationMode;
    toggleButtonActive('annotation-btn', state.isAnnotationMode);
    renderer.domElement.style.cursor = state.isAnnotationMode ? 'crosshair' : 'default';
    if (!state.isAnnotationMode) {
        hideAnnotationPanel();
    }
}

function createAnnotationAtPoint(point) {
    const annotation = {
        id: `anno-${Date.now()}`,
        position: { x: point.x, y: point.y, z: point.z },
        cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        comments: []
    };

    // Save to Firestore
    saveAnnotation(annotation);

    // Show the panel and turn off annotation mode
    showAnnotationPanel(annotation);
    toggleAnnotationMode();
}

export function showAnnotationPanel(annotation) {
    const panel = document.getElementById('visor3d-annotations-panel');
    const panelTitle = document.getElementById('annotations-panel-title');
    const list = document.getElementById('annotations-list');

    if (panel && panelTitle && list) {
        panel.dataset.annotationId = annotation.id;
        panelTitle.textContent = `Anotación #${annotation.id.slice(-4)}`;
        panel.classList.remove('hidden');

        if (annotation.comments && annotation.comments.length > 0) {
            list.innerHTML = annotation.comments.map(comment => `
                <div class="p-2 bg-slate-100 rounded-md">
                    <p class="text-sm text-slate-800">${comment.text}</p>
                    <p class="text-xs text-slate-500 mt-1">${comment.userName} - ${new Date(comment.timestamp).toLocaleString()}</p>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p class="text-sm text-slate-500 italic">No hay comentarios aún.</p>';
        }
    }
}

export function hideAnnotationPanel() {
    const panel = document.getElementById('visor3d-annotations-panel');
    if (panel) {
        panel.classList.add('hidden');
        panel.removeAttribute('data-annotation-id');
    }
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
    if (measurementState.line) {
        scene.remove(measurementState.line);
        measurementState.line.geometry.dispose();
        measurementState.line.material.dispose();
        measurementState.line = null;
    }
    if (measurementState.label) {
        scene.remove(measurementState.label);
        // CSS2DObject doesn't have a dispose method for its element, it's just removed.
        measurementState.label = null;
    }

    if (measurementPoints.length === 2) {
        const [p1, p2] = measurementPoints;

        // Create line with Line2 for thickness control
        const positions = [p1.x, p1.y, p1.z, p2.x, p2.y, p2.z];
        const geometry = new LineGeometry();
        geometry.setPositions(positions);

        const material = new LineMaterial({
            color: 0xffff00, // Yellow
            linewidth: 3, // In pixels
            resolution: new THREE.Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight),
            depthTest: false, // Render on top
        });

        measurementState.line = new Line2(geometry, material);
        measurementState.line.renderOrder = 999; // Ensure it's rendered last (on top)
        scene.add(measurementState.line);

        // Create label
        const distance = p1.distanceTo(p2);
        const distanceInMm = distance * 1000;
        const text = document.createElement('div');
        text.className = 'visor3d-measurement-label';
        text.textContent = `${distanceInMm.toFixed(2)} mm`;

        measurementState.label = new CSS2DObject(text);
        measurementState.label.position.lerpVectors(p1, p2, 0.5);
        scene.add(measurementState.label);

        // Reset for next measurement
        measurementPoints.length = 0;
    }
}

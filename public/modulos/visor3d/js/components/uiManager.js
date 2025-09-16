import { state, selectedObjects, partCharacteristics } from '../visor3d.js';

export function createVisorUI() {
    const container = document.getElementById('view-content');
    if (!container) return;

    container.innerHTML = `
        <div id="visor3d-container">
            <div id="visor3d-scene-container">
                <div id="visor3d-status" class="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/80 z-10">
                    <p id="visor3d-status-text" class="text-slate-600 font-semibold text-lg animate-pulse mb-4">Seleccione un modelo para comenzar...</p>
                    <div id="visor3d-progress-bar-container" class="w-1/2 bg-slate-300 rounded-full h-4 hidden">
                        <div id="visor3d-progress-bar" class="bg-blue-500 h-4 rounded-full" style="width: 0%"></div>
                    </div>
                </div>
            </div>
            <div id="axis-gizmo-container"></div>
            <div id="visor3d-panel">
                <div id="visor3d-panel-header">
                    <div class="space-y-2 mb-2">
                        <h3 class="text-lg font-bold">Modelos Disponibles</h3>
                        <div id="model-button-container" class="flex flex-wrap gap-2">
                            <!-- Los botones de los modelos se insertarán aquí dinámicamente -->
                            <span class="text-sm text-slate-500">Cargando...</span>
                        </div>
                    </div>
                    <div class="flex justify-between items-center border-t pt-2 mt-2">
                        <div id="visor3d-controls" class="flex items-center gap-2">
                            <button id="explode-btn" class="visor3d-control-btn" title="Vista explosionada"><i data-lucide="move-3d"></i></button>
                            <button id="isolate-btn" class="visor3d-control-btn" title="Aislar Pieza" disabled><i data-lucide="zap"></i></button>
                            <button id="lock-selection-btn" class="visor3d-control-btn" title="Bloquear Selección" disabled><i data-lucide="lock"></i></button>
                            <button id="selection-transparency-btn" class="visor3d-control-btn" title="Ver Selección (Transparentar el Resto)"><i data-lucide="group"></i></button>
                            <button id="clipping-btn" class="visor3d-control-btn" title="Vista de Sección"><i data-lucide="scissors"></i></button>
                            <button id="measure-btn" class="visor3d-control-btn" title="Medir Distancia"><i data-lucide="ruler"></i></button>
                            <button id="annotation-btn" class="visor3d-control-btn" title="Modo Anotación"><i data-lucide="message-square-plus"></i></button>
                            <button id="reset-view-btn" class="visor3d-control-btn" title="Resetear vista"><i data-lucide="rotate-cw"></i></button>
                            <button id="help-tutorial-btn" class="p-2 rounded-full hover:bg-slate-100" title="Ayuda y Tutorial">
                                <i data-lucide="help-circle" class="w-6 h-6 text-slate-600"></i>
                            </button>
                        </div>
                    </div>
                    <input type="text" id="visor3d-search" placeholder="Buscar pieza..." class="mt-2">
                </div>
                <div id="visor3d-controls-container" class="p-2 border-b border-slate-200">
                    <details class="visor-section">
                        <summary>Controles Visuales</summary>
                        <div class="visor-section-content">
                            <label for="sun-intensity">Intensidad Sol</label>
                            <input type="range" id="sun-intensity" min="0" max="4" step="0.1" value="2.5">

                            <label for="ambient-light">Luz Ambiente</label>
                            <input type="range" id="ambient-light" min="0" max="2" step="0.05" value="0.5">

                            <div id="explode-controls" class="hidden mt-2">
                                <label for="explode-factor" class="font-semibold text-sm text-slate-600">Distancia de Explosión</label>
                                <input type="range" id="explode-factor" min="0" max="5" step="0.1" value="1.5" class="w-full mt-1">
                            </div>
                        </div>
                    </details>
                    <details id="clipping-controls-details" class="visor-section">
                        <summary>Controles de Corte</summary>
                        <div class="visor-section-content">
                            <div class="mb-2">
                                <label class="font-semibold text-sm text-slate-600">Eje de Corte</label>
                                <div id="clipping-axis-buttons" class="grid grid-cols-3 gap-2 mt-1">
                                    <button data-axis="x" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100 active">X</button>
                                    <button data-axis="y" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100">Y</button>
                                    <button data-axis="z" class="p-2 text-sm font-semibold border rounded-md hover:bg-slate-100">Z</button>
                                </div>
                            </div>
                            <div>
                                <label for="clipping-position" class="font-semibold text-sm text-slate-600">Posición</label>
                                <input type="range" id="clipping-position" min="-5" max="5" step="0.1" value="5" class="w-full mt-1">
                            </div>
                        </div>
                    </details>
                </div>
                <div id="visor3d-parts-list"></div>
                <div id="visor3d-piece-card" class="border-t border-slate-200 p-4 hidden">
                    <div class="flex justify-between items-center mb-2">
                        <h4 id="piece-card-title" class="text-md font-bold"></h4>
                        <button id="zoom-to-part-btn" class="p-1 text-slate-500 hover:text-blue-600" title="Enfocar pieza">
                            <i data-lucide="zoom-in" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div id="piece-card-details"></div>
                </div>
                <div id="visor3d-annotations-panel" class="border-t border-slate-200 p-4 hidden">
                    <div class="flex justify-between items-center mb-2">
                        <h4 id="annotations-panel-title" class="text-md font-bold">Anotación</h4>
                        <button id="close-annotations-panel-btn" class="p-1 text-slate-500 hover:text-red-600" title="Cerrar">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div id="annotations-list" class="mb-4 max-h-60 overflow-y-auto space-y-2">
                        <!-- Annotation comments will be rendered here -->
                    </div>
                    <div id="add-comment-form">
                        <textarea id="comment-text" class="w-full border rounded-md p-2 text-sm" rows="2" placeholder="Añadir un comentario..."></textarea>
                        <button id="add-comment-btn" class="w-full mt-2 bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 text-sm font-semibold">Añadir Comentario</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.classList.add('visor3d-active');
    lucide.createIcons();
    document.querySelectorAll('.visor-section').forEach(details => details.open = false);
}

export function updateStatus(message, isError = false, showProgressBar = false) {
    const statusEl = document.getElementById('visor3d-status');
    const statusText = document.getElementById('visor3d-status-text');
    const progressBarContainer = document.getElementById('visor3d-progress-bar-container');

    if (statusEl && statusText && progressBarContainer) {
        if (message) {
            statusEl.classList.remove('hidden');
            statusText.textContent = message;
            statusText.className = `font-semibold text-lg ${isError ? 'text-red-500' : 'text-slate-600'} ${isError ? '' : 'animate-pulse'}`;
            progressBarContainer.classList.toggle('hidden', !showProgressBar);
        } else {
            statusEl.classList.add('hidden');
        }
    }
}

export function disableAnnotationFeatures() {
    const annotationBtn = document.getElementById('annotation-btn');
    if (annotationBtn) {
        annotationBtn.disabled = true;
        annotationBtn.title = "Anotaciones deshabilitadas por configuración del servidor";
    }
    // Optionally, hide the button entirely
    // if (annotationBtn) annotationBtn.style.display = 'none';

    // Also disable the panel in case it's somehow opened
    const panel = document.getElementById('visor3d-annotations-panel');
    if (panel) panel.classList.add('hidden');

    // You could also show a persistent message on the UI
    const statusContainer = document.getElementById('visor3d-status');
    if (statusContainer && statusContainer.classList.contains('hidden')) {
        const notice = document.createElement('p');
        notice.className = 'absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-800 text-sm font-semibold px-4 py-2 rounded-md shadow-lg';
        notice.textContent = 'Las anotaciones están deshabilitadas por el administrador.';
        document.getElementById('visor3d-scene-container').appendChild(notice);
    }
}

export function renderPartsList(partNames) {
    const partsListContainer = document.getElementById('visor3d-parts-list');
    if (!partsListContainer) return;

    if (partNames.length === 0) {
        partsListContainer.innerHTML = '<p class="text-sm text-slate-500 p-4">No se encontraron piezas nombradas en el modelo.</p>';
        return;
    }

    partsListContainer.innerHTML = `
        <ul class="divide-y divide-slate-200">
            ${partNames.map(partName => `
                <li class="flex items-center justify-between p-2 hover:bg-slate-100" data-part-name="${partName}">
                    <button class="flex-grow text-left text-sm p-1">
                        ${partName}
                    </button>
                    <button class="p-2 text-slate-500 hover:text-blue-600" data-action="toggle-visibility" title="Ocultar/Mostrar Pieza">
                        <i data-lucide="eye" class="pointer-events-none"></i>
                    </button>
                </li>
            `).join('')}
        </ul>
    `;
    lucide.createIcons();
}

export function updatePieceCard(object) {
    const pieceTitle = document.getElementById('piece-card-title');
    const detailsContainer = document.getElementById('piece-card-details');
    if (!pieceTitle || !detailsContainer) return;

    const partName = object.name;
    const displayName = partName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    pieceTitle.textContent = displayName;

    let characteristics = partCharacteristics[partName] || partCharacteristics[partName.split('_')[0]];
    const characteristicsToDisplay = { ...characteristics };
    delete characteristicsToDisplay.explosionVector;

    if (characteristics && Object.keys(characteristicsToDisplay).length > 0) {
        detailsContainer.innerHTML = Object.entries(characteristicsToDisplay).map(([key, value]) => `
            <div class="flex justify-between py-1 border-b border-slate-200 text-sm">
                <span class="font-semibold text-slate-500">${key.replace(/_/g, ' ')}:</span>
                <span class="text-right text-slate-700">${value}</span>
            </div>`).join('');
    } else {
        detailsContainer.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-200 text-sm">
                <span class="font-semibold text-slate-500">Nombre:</span>
                <span class="text-right text-slate-700">${displayName}</span>
            </div>
            <p class="text-slate-400 italic py-2 mt-2 text-sm">No hay más información detallada disponible.</p>`;
    }
}

export function updateSelectionUI() {
    const pieceCard = document.getElementById('visor3d-piece-card');
    const isolateBtn = document.getElementById('isolate-btn');
    const lockSelectionBtn = document.getElementById('lock-selection-btn');

    const hasSelection = selectedObjects.length > 0;

    if (isolateBtn) {
        isolateBtn.disabled = !hasSelection;
    }

    if (lockSelectionBtn) {
        lockSelectionBtn.disabled = !hasSelection;
        if (!hasSelection && state.isSelectionLocked) {
            // This case will be handled in eventManager, but good to have a fallback.
            // It will force unlock if selection is cleared.
        }
    }

    if (pieceCard) {
        const lastSelected = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;
        if (lastSelected) {
            updatePieceCard(lastSelected);
            pieceCard.classList.remove('hidden');
        } else {
            pieceCard.classList.add('hidden');
        }
    }

    document.querySelectorAll('#visor3d-parts-list li').forEach(li => {
        li.classList.remove('selected-part');
    });
    selectedObjects.forEach(obj => {
        const listItem = document.querySelector(`#visor3d-parts-list li[data-part-name="${obj.name}"]`);
        if (listItem) {
            listItem.classList.add('selected-part');
        }
    });
}

export function toggleButtonActive(buttonId, isActive) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.classList.toggle('active', isActive);
    }
}

export function toggleExplodeControls(show) {
    const controls = document.getElementById('explode-controls');
    if (controls) {
        controls.classList.toggle('hidden', !show);
    }
}

export function toggleClippingControls(show) {
    const controls = document.getElementById('clipping-controls-details');
    if (controls) {
        controls.open = show;
    }
}

export function updateIsolationButton(isIsolated) {
    const isolateBtn = document.getElementById('isolate-btn');
    if (isolateBtn) {
        const icon = isolateBtn.querySelector('i');
        isolateBtn.setAttribute('title', isIsolated ? 'Mostrar Todo' : 'Aislar Pieza');
        if (icon) {
            icon.setAttribute('data-lucide', isIsolated ? 'eye' : 'zap');
            lucide.createIcons();
        }
    }
}

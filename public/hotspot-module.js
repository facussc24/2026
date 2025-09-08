/**
 * @file hotspot-module.js
 * @description Módulo reutilizable para crear, editar y visualizar hotspots en una imagen.
 * @version 2.0.0
 */

// Prefijo para clases CSS para evitar colisiones
const CSS_PREFIX = 'vhm-'; // Viewer Hotspot Module

const HotspotModule = (function() {
    // --- State ---
    let state = {
        isEditMode: false,
        isDrawing: false,
        selectedHotspotId: null,
        hotspots: [],
        currentPoints: [], // For drawing new polygons
        draggingHandle: null, // For moving vertices
    };

    // --- Private Variables ---
    let container = null;
    let tempPolygon = null; // The temporary polygon element shown while drawing
    let eventListeners = {
        'change': [],
        'select': [],
        'load': [],
        'editModeEnter': [],
        'editModeExit': [],
        'hotspotUpdate': [],
    };

    // --- DOM Elements ---
    let dom = {
        image: null,
        svg: null,
    };

    // --- Private Methods ---

    /**
     * Emite un evento a los listeners registrados.
     * @param {string} eventName - El nombre del evento.
     * @param {any} detail - La información a pasar al callback.
     */
    function emit(eventName, detail) {
        if (eventListeners[eventName]) {
            eventListeners[eventName].forEach(callback => callback(detail));
        }
    }

    /**
     * Redraws all hotspots from the `state.hotspots` array onto the SVG canvas.
     */
    function drawHotspots() {
        if (!dom.image || !dom.svg) return;
        const imageWidth = dom.image.width;
        const imageHeight = dom.image.height;

        if (imageWidth === 0 || imageHeight === 0) return;

        // Clear previous hotspots (polygons and handles)
        dom.svg.innerHTML = '';

        state.hotspots.forEach(hotspot => {
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const pointsStr = hotspot.points
                .map(p => `${p.x * imageWidth},${p.y * imageHeight}`)
                .join(' ');

            polygon.setAttribute('points', pointsStr);
            polygon.setAttribute('class', `${CSS_PREFIX}hotspot-polygon`);
            if (hotspot.id === state.selectedHotspotId) {
                polygon.classList.add('active');
            }
            polygon.dataset.id = hotspot.id;
            dom.svg.appendChild(polygon);
        });

        if (state.isEditMode) {
            drawHandles();
        }
    }

    /**
     * Draws the interactive handles for the selected hotspot's vertices.
     */
    function drawHandles() {
        // Clear existing handles first
        dom.svg.querySelectorAll(`.${CSS_PREFIX}handle`).forEach(h => h.remove());

        if (!state.selectedHotspotId) return;

        const hotspot = state.hotspots.find(h => h.id === state.selectedHotspotId);
        if (!hotspot) return;

        const imageWidth = dom.image.width;
        const imageHeight = dom.image.height;

        hotspot.points.forEach((point, index) => {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            handle.setAttribute('cx', point.x * imageWidth);
            handle.setAttribute('cy', point.y * imageHeight);
            handle.setAttribute('r', 8); // Make this configurable?
            handle.setAttribute('class', `${CSS_PREFIX}handle`);
            handle.dataset.hotspotId = state.selectedHotspotId;
            handle.dataset.pointIndex = index;
            dom.svg.appendChild(handle);
        });
    }

    function selectHotspot(hotspotId) {
        if (state.selectedHotspotId === hotspotId) return;

        state.selectedHotspotId = hotspotId;

        const allPolygons = dom.svg.querySelectorAll(`.${CSS_PREFIX}hotspot-polygon`);
        allPolygons.forEach(p => p.classList.remove('active'));

        if (hotspotId) {
            const selectedPolygon = dom.svg.querySelector(`[data-id="${hotspotId}"]`);
            if (selectedPolygon) {
                selectedPolygon.classList.add('active');
            }
        }

        if (state.isEditMode) {
            drawHandles();
        }

        const hotspotData = state.hotspots.find(h => h.id === hotspotId) || null;
        emit('select', hotspotData);
    }

    function resetDrawingState() {
        state.isDrawing = false;
        state.currentPoints = [];
        if (tempPolygon) {
            tempPolygon.remove();
            tempPolygon = null;
        }
        if (dom.svg) {
            dom.svg.classList.remove(`${CSS_PREFIX}drawing-mode`);
        }
    }

    function finishDrawing() {
        if (state.currentPoints.length < 3) {
            console.warn('A hotspot requires at least 3 points.');
            resetDrawingState();
            return;
        }

        const imageWidth = dom.image.width;
        const imageHeight = dom.image.height;

        const newHotspot = {
            id: `hotspot_${Date.now()}`,
            name: 'Nuevo Hotspot',
            partNumber: '',
            description: '',
            imageUrl: '',
            points: state.currentPoints.map(p => ({
                x: p.x / imageWidth,
                y: p.y / imageHeight
            }))
        };

        state.hotspots.push(newHotspot);
        resetDrawingState();
        drawHotspots();
        selectHotspot(newHotspot.id);
        emit('change', { action: 'add', hotspot: newHotspot, hotspots: state.hotspots });
    }

    // --- Event Handlers ---
    function onSvgClick(e) {
        if (state.isEditMode && state.isDrawing) {
            const rect = dom.image.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            state.currentPoints.push({ x, y });

            if (!tempPolygon) {
                tempPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                tempPolygon.setAttribute('class', `${CSS_PREFIX}hotspot-polygon active`);
                dom.svg.appendChild(tempPolygon);
            }

            const pointsStr = state.currentPoints.map(p => `${p.x},${p.y}`).join(' ');
            tempPolygon.setAttribute('points', pointsStr);
            return;
        }

        const targetPolygon = e.target.closest(`.${CSS_PREFIX}hotspot-polygon`);
        if (targetPolygon) {
            selectHotspot(targetPolygon.dataset.id);
        } else {
            // Clicked outside any polygon
            selectHotspot(null);
        }
    }

    function onSvgDblClick(e) {
        if (state.isEditMode && state.isDrawing) {
            finishDrawing();
        }
    }

    function onMouseDown(e) {
        const targetHandle = e.target.closest(`.${CSS_PREFIX}handle`);
        if (state.isEditMode && targetHandle) {
            state.draggingHandle = {
                element: targetHandle,
                hotspotId: targetHandle.dataset.hotspotId,
                pointIndex: parseInt(targetHandle.dataset.pointIndex, 10)
            };
            e.stopPropagation();
        }
    }

    function onMouseMove(e) {
        if (!state.draggingHandle) return;

        const rect = dom.image.getBoundingClientRect();
        const imageWidth = dom.image.width;
        const imageHeight = dom.image.height;

        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Clamp coordinates to be within the image bounds
        x = Math.max(0, Math.min(x, imageWidth));
        y = Math.max(0, Math.min(y, imageHeight));

        const { element, hotspotId, pointIndex } = state.draggingHandle;

        // Update handle position visually
        element.setAttribute('cx', x);
        element.setAttribute('cy', y);

        // Update polygon points in state
        const hotspot = state.hotspots.find(h => h.id === hotspotId);
        if (hotspot) {
            hotspot.points[pointIndex] = { x: x / imageWidth, y: y / imageHeight };

            // Update the polygon's points attribute
            const polygon = dom.svg.querySelector(`.${CSS_PREFIX}hotspot-polygon[data-id="${hotspotId}"]`);
            if (polygon) {
                const pointsStr = hotspot.points
                    .map(p => `${p.x * imageWidth},${p.y * imageHeight}`)
                    .join(' ');
                polygon.setAttribute('points', pointsStr);
            }
        }
    }

    function onMouseUp() {
        if (state.draggingHandle) {
            const hotspot = state.hotspots.find(h => h.id === state.draggingHandle.hotspotId);
            emit('change', { action: 'update', hotspot: hotspot, hotspots: state.hotspots });
            state.draggingHandle = null;
        }
    }

    function attachEventListeners() {
        if (!dom.svg) return;
        dom.svg.addEventListener('click', onSvgClick);
        dom.svg.addEventListener('dblclick', onSvgDblClick);
        dom.svg.addEventListener('mousedown', onMouseDown);
        // Mouse move and up are global to handle dragging outside the SVG
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('resize', drawHotspots);
    }

    function
    detachEventListeners() {
        if (!dom.svg) return;
        dom.svg.removeEventListener('click', onSvgClick);
        dom.svg.removeEventListener('dblclick', onSvgDblClick);
        dom.svg.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('resize', drawHotspots);
    }


    // --- Public API ---
    const publicApi = {
        init(containerElement, userOptions = {}) {
            container = typeof containerElement === 'string' ? document.querySelector(containerElement) : containerElement;
            if (!container) {
                console.error('HotspotModule: Container element not found.');
                return;
            }

            // Default options and merge with user options
            const options = {
                imageSelector: `.${CSS_PREFIX}image`,
                svgSelector: `.${CSS_PREFIX}svg`,
                ...userOptions
            };

            dom.image = container.querySelector(options.imageSelector);
            dom.svg = container.querySelector(options.svgSelector);

            if (!dom.image || !dom.svg) {
                console.error('HotspotModule: Image or SVG element not found within the container.');
                return;
            }

            // Ensure SVG is sized correctly relative to the image
            dom.svg.setAttribute('viewBox', `0 0 ${dom.image.naturalWidth} ${dom.image.naturalHeight}`);
            dom.image.onload = () => {
                dom.svg.setAttribute('viewBox', `0 0 ${dom.image.naturalWidth} ${dom.image.naturalHeight}`);
                drawHotspots();
            };

            attachEventListeners();

            // Initial draw if image is already loaded
            if (dom.image.complete) {
                drawHotspots();
            }

            console.log('Hotspot Module Initialized.');
        },

        loadHotspots(hotspotsArray) {
            if (!Array.isArray(hotspotsArray)) {
                console.error('loadHotspots expects an array.');
                return;
            }
            state.hotspots = JSON.parse(JSON.stringify(hotspotsArray)); // Deep copy
            drawHotspots();
            emit('load', state.hotspots);
            emit('change', { action: 'load', hotspots: state.hotspots });
        },

        updateHotspot(hotspotId, data) {
            const hotspot = state.hotspots.find(h => h.id === hotspotId);
            if (hotspot) {
                Object.assign(hotspot, data);
                emit('hotspotUpdate', hotspot);
                emit('change', { action: 'update', hotspot: hotspot, hotspots: state.hotspots });
            }
        },

        deleteHotspot(hotspotId) {
            const index = state.hotspots.findIndex(h => h.id === hotspotId);
            if (index > -1) {
                const deleted = state.hotspots.splice(index, 1);
                if (state.selectedHotspotId === hotspotId) {
                    selectHotspot(null);
                }
                drawHotspots();
                emit('change', { action: 'delete', hotspot: deleted[0], hotspots: state.hotspots });
            }
        },

        startDrawing() {
            if (!state.isEditMode) {
                console.warn("Must be in edit mode to start drawing.");
                return;
            }
            resetDrawingState();
            state.isDrawing = true;
            dom.svg.classList.add(`${CSS_PREFIX}drawing-mode`);
        },

        finishDrawing,

        getState() {
            return JSON.parse(JSON.stringify(state));
        },

        exportJSON() {
            return JSON.stringify(state.hotspots, null, 2);
        },

        importJSON(json) {
            try {
                const newHotspots = JSON.parse(json);
                if (Array.isArray(newHotspots)) {
                    this.loadHotspots(newHotspots);
                } else {
                    console.error('Imported JSON is not a valid array.');
                }
            } catch (error) {
                console.error('Error parsing JSON: ' + error.message);
            }
        },

        enterEditMode() {
            if (state.isEditMode) return;
            state.isEditMode = true;
            dom.svg.classList.add(`${CSS_PREFIX}edit-mode`);
            drawHandles();
            emit('editModeEnter');
        },

        exitEditMode() {
            if (!state.isEditMode) return;
            resetDrawingState();
            selectHotspot(null);
            state.isEditMode = false;
            dom.svg.classList.remove(`${CSS_PREFIX}edit-mode`);
            drawHandles(); // This will clear them
            emit('editModeExit');
        },

        destroy() {
            detachEventListeners();
            container.innerHTML = '';
            state = { isEditMode: false, isDrawing: false, selectedHotspotId: null, hotspots: [], currentPoints: [], draggingHandle: null };
            dom = { image: null, svg: null };
            eventListeners = { 'change': [], 'select': [], 'load': [] };
        },

        on(eventName, callback) {
            if (eventListeners[eventName]) {
                eventListeners[eventName].push(callback);
            } else {
                console.warn(`Event '${eventName}' is not supported.`);
            }
        }
    };

    return publicApi;
})();

// Expose as ES module and optionally as a global variable
export default HotspotModule;

if (typeof window !== 'undefined') {
    window.HotspotModule = HotspotModule;
}

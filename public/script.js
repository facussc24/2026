/**
 * @file script.js
 * @description Logic for the interactive hotspot editor and viewer.
 * @version 1.0.0
 *
 * @tests Manuale de Prueba Funcional:
 *
 * 1. DIBUJAR HOTSPOT NUEVO:
 *    - Clic en "Modo Editor".
 *    - Clic en "Añadir Hotspot".
 *    - Hacer clic en 3 o más puntos sobre la imagen para formar un polígono.
 *    - Hacer doble clic o clic en "Finalizar Hotspot" para terminar el polígono.
 *    - El nuevo hotspot debe aparecer en la lista de "Zonas Creadas".
 *
 * 2. EDITAR VÉRTICES:
 *    - En "Modo Editor", hacer clic en un polígono existente en la imagen o en la lista.
 *    - Deben aparecer círculos (manejadores) en cada vértice.
 *    - Arrastrar un manejador para mover el vértice. El polígono debe actualizarse en tiempo real.
 *
 * 3. GUARDAR Y EXPORTAR JSON:
 *    - En "Modo Editor", hacer clic en un hotspot de la lista para seleccionarlo.
 *    - Rellenar los campos del formulario (Nombre, N° de Parte, etc.) y hacer clic en "Guardar Cambios".
 *    - El nombre en la lista debe actualizarse.
 *    - Hacer clic en "Exportar" en la sección de JSON. El área de texto se llenará con la configuración actual.
 *
 * 4. RECARGAR Y VOLVER A IMPORTAR:
 *    - Copiar el texto del área JSON.
 *    - Recargar la página (F5). Los hotspots personalizados desaparecerán.
 *    - Entrar en "Modo Editor".
 *    - Pegar el texto JSON copiado en el área de texto.
 *    - Hacer clic en "Importar". Los hotspots guardados deben reaparecer en la imagen y en la lista.
 *
 * 5. CLIC EN HOTSPOT (MODO VISUALIZADOR):
 *    - Asegurarse de que el "Modo Editor" esté desactivado.
 *    - Hacer clic en un polígono sobre la imagen.
 *    - El panel lateral derecho debe aparecer con la información del hotspot y el polígono debe cambiar de color.
 *    - Al hacer clic en el botón de cerrar del panel o presionar 'Escape', el panel debe cerrarse.
 *
 * 6. CAMBIAR TAMAÑO DE VENTANA:
 *    - Con los hotspots visibles, cambiar el tamaño de la ventana del navegador.
 *    - Los polígonos deben mantenerse anclados a sus posiciones relativas sobre la imagen, escalando correctamente.
 */
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        // --- DOM Element Cache ---
        const vehicleImage = document.getElementById('vehicle-image');
        const hotspotSvg = document.getElementById('hotspot-svg');
        const sidePanel = document.getElementById('side-panel');
        const panelContent = document.getElementById('panel-content');
        const closePanelBtn = document.getElementById('close-panel-btn');

        // --- Editor DOM Elements ---
        const editModeBtn = document.getElementById('edit-mode-btn');
        const editorPanel = document.getElementById('editor-panel');
        const closeEditorBtn = document.getElementById('close-editor-btn');
        const addHotspotBtn = document.getElementById('add-hotspot-btn');
        const finishHotspotBtn = document.getElementById('finish-hotspot-btn');
        const deleteHotspotBtn = document.getElementById('delete-hotspot-btn');
        const hotspotList = document.getElementById('hotspot-list');
        const jsonConfig = document.getElementById('json-config');
        const importJsonBtn = document.getElementById('import-json-btn');
        const exportJsonBtn = document.getElementById('export-json-btn');
        const hotspotFormContainer = document.getElementById('hotspot-form-container');
        const hotspotForm = document.getElementById('hotspot-form');
        const cancelEditBtn = document.getElementById('cancel-edit-btn');
        const saveHotspotBtn = document.getElementById('save-hotspot-btn');


        // --- Application State ---
        let isEditMode = false; // Is the editor panel open?
        let isDrawing = false;  // Are we currently drawing a new polygon?
        let currentPoints = []; // Stores points for the polygon being drawn
        let selectedHotspotId = null; // The ID of the hotspot currently selected for editing
        let tempPolygon = null; // The temporary polygon element shown while drawing


        // --- Data Store ---
        // This array holds the single source of truth for all hotspot data.
        // It uses normalized coordinates (0 to 1) to ensure scalability on window resize.
        let hotspots = [
            {
                id: 'apoyacabezas',
                name: 'Apoyacabezas',
                partNumber: 'V-102-3C',
                description: 'Apoyacabezas de cuero sintético, ajustable en altura y ángulo.',
                imageUrl: 'https://via.placeholder.com/300x200.png?text=Apoyacabezas',
                points: [
                    { x: 0.496, y: 0.222 },
                    { x: 0.560, y: 0.246 },
                    { x: 0.538, y: 0.334 },
                    { x: 0.478, y: 0.304 }
                ]
            },
            {
                id: 'apoyabrazos',
                name: 'Apoyabrazos Central',
                partNumber: 'V-105-1A',
                description: 'Consola de apoyabrazos central con compartimento de almacenamiento.',
                imageUrl: 'https://via.placeholder.com/300x200.png?text=Apoyabrazos',
                points: [
                    { x: 0.458, y: 0.505 },
                    { x: 0.528, y: 0.508 },
                    { x: 0.530, y: 0.558 },
                    { x: 0.459, y: 0.556 }
                ]
            }
        ];

        /**
         * Redraws all hotspots from the `hotspots` array onto the SVG canvas.
         * It converts normalized coordinates to pixel coordinates based on the image's current size.
         */
        function drawHotspots() {
            const imageWidth = vehicleImage.width;
            const imageHeight = vehicleImage.height;

            if (imageWidth === 0 || imageHeight === 0) return;

            hotspotSvg.innerHTML = ''; // Clear previous hotspots

            hotspots.forEach(hotspot => {
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');

                const pointsStr = hotspot.points
                    .map(p => `${p.x * imageWidth},${p.y * imageHeight}`)
                    .join(' ');

                polygon.setAttribute('points', pointsStr);
                polygon.setAttribute('class', 'hotspot-polygon');
                polygon.dataset.id = hotspot.id;

                hotspotSvg.appendChild(polygon);
            });
        }

        /**
         * Opens the side panel with the details of a selected hotspot.
         * @param {object} hotspot The hotspot object to display.
         */
        function openPanel(hotspot) {
            // Highlight active hotspot
            document.querySelectorAll('.hotspot-polygon').forEach(p => {
                p.classList.remove('active');
            });
            document.querySelector(`.hotspot-polygon[data-id="${hotspot.id}"]`).classList.add('active');

            // Populate and show panel
            panelContent.innerHTML = `
                <img src="${hotspot.imageUrl}" alt="${hotspot.name}" class="w-full h-48 object-cover rounded-lg mb-4">
                <h3 class="text-xl font-bold text-gray-900">${hotspot.name}</h3>
                <p class="text-sm text-gray-500 mb-2">N/P: ${hotspot.partNumber}</p>
                <p class="text-gray-700">${hotspot.description}</p>
            `;
            sidePanel.classList.add('open');
        }

        /**
         * Closes the viewer's side panel.
         */
        function closePanel() {
            sidePanel.classList.remove('open');
            document.querySelectorAll('.hotspot-polygon').forEach(p => {
                p.classList.remove('active');
            });
        }

        /**
         * Handles keyboard events for accessibility, specifically for the side panels.
         * - Allows closing panels with the 'Escape' key.
         * - Traps focus within the open panel when 'Tab' is pressed.
         * @param {KeyboardEvent} e The keyboard event.
         */
        function handlePanelKeyboard(e) {
            if (!sidePanel.classList.contains('open') && !editorPanel.classList.contains('open')) return;

            const activePanel = sidePanel.classList.contains('open') ? sidePanel : editorPanel;

            if (e.key === 'Escape') {
                if (activePanel === sidePanel) closePanel();
                else toggleEditMode();
            }

            if (e.key === 'Tab') {
                const focusableElements = activePanel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        e.preventDefault();
                    }
                }
            }
        }

        // --- Main Event Listeners ---

        // Handles clicks on the main SVG canvas for drawing and selecting hotspots.
        hotspotSvg.addEventListener('click', (e) => {
            if (isEditMode && isDrawing) {
                addPointToCurrentHotspot(e);
                return;
            }

            if (isEditMode && e.target.classList.contains('hotspot-polygon')) {
                selectHotspot(e.target.dataset.id);
                return;
            }

            if (e.target.classList.contains('hotspot-polygon')) {
                const hotspotId = e.target.dataset.id;
                const hotspotData = hotspots.find(h => h.id === hotspotId);
                if (hotspotData) {
                    openPanel(hotspotData);
                }
            }
        });

        hotspotSvg.addEventListener('dblclick', (e) => {
            if (isEditMode && isDrawing) {
                finishDrawing();
            }
        });

        let draggingHandle = null;

        hotspotSvg.addEventListener('mousedown', (e) => {
            if (isEditMode && e.target.classList.contains('handle')) {
                draggingHandle = {
                    element: e.target,
                    hotspotId: e.target.dataset.hotspotId,
                    pointIndex: parseInt(e.target.dataset.pointIndex, 10)
                };
                e.stopPropagation();
            }
        });

        hotspotSvg.addEventListener('mousemove', (e) => {
            if (!draggingHandle) return;

            const rect = vehicleImage.getBoundingClientRect();
            const imageWidth = vehicleImage.width;
            const imageHeight = vehicleImage.height;

            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;

            // Clamp coordinates to be within the image bounds
            x = Math.max(0, Math.min(x, imageWidth));
            y = Math.max(0, Math.min(y, imageHeight));


            const { element, hotspotId, pointIndex } = draggingHandle;

            // Update handle position
            element.setAttribute('cx', x);
            element.setAttribute('cy', y);

            // Update polygon points
            const hotspot = hotspots.find(h => h.id === hotspotId);
            hotspot.points[pointIndex] = { x: x / imageWidth, y: y / imageHeight };

            const polygon = document.querySelector(`.hotspot-polygon[data-id="${hotspotId}"]`);
            const pointsStr = hotspot.points
                .map(p => `${p.x * imageWidth},${p.y * imageHeight}`)
                .join(' ');
            polygon.setAttribute('points', pointsStr);
        });

        window.addEventListener('mouseup', (e) => {
            draggingHandle = null;
        });


        function addPointToCurrentHotspot(e) {
            const rect = vehicleImage.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            currentPoints.push({ x, y });

            if (!tempPolygon) {
                tempPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                tempPolygon.setAttribute('class', 'hotspot-polygon active');
                hotspotSvg.appendChild(tempPolygon);
            }

            const pointsStr = currentPoints.map(p => `${p.x},${p.y}`).join(' ');
            tempPolygon.setAttribute('points', pointsStr);
        }

        function finishDrawing() {
            if (currentPoints.length < 3) {
                alert('Se necesitan al menos 3 puntos para crear un hotspot.');
                resetDrawingState();
                return;
            }

            const imageWidth = vehicleImage.width;
            const imageHeight = vehicleImage.height;

            const newHotspot = {
                id: `hotspot_${Date.now()}`,
                name: 'Nuevo Hotspot',
                partNumber: '',
                description: '',
                imageUrl: '',
                points: currentPoints.map(p => ({
                    x: p.x / imageWidth,
                    y: p.y / imageHeight
                }))
            };

            hotspots.push(newHotspot);
            resetDrawingState();
            drawHotspots();
            // In a real app, you'd probably want to open the editor for the new hotspot here
        }

        function resetDrawingState() {
            isDrawing = false;
            currentPoints = [];
            if (tempPolygon) {
                tempPolygon.remove();
                tempPolygon = null;
            }
            hotspotSvg.classList.remove('drawing-mode');
            // Update UI buttons
            addHotspotBtn.classList.remove('hidden');
            finishHotspotBtn.classList.add('hidden');
        }

        function selectHotspot(hotspotId) {
            selectedHotspotId = hotspotId;
            // de-select any active polygons
            document.querySelectorAll('.hotspot-polygon').forEach(p => {
                p.classList.remove('active');
            });
            if (hotspotId) {
                document.querySelector(`.hotspot-polygon[data-id="${hotspotId}"]`).classList.add('active');
            }
            drawHandles();
        }

        function drawHandles() {
            // Clear existing handles
            document.querySelectorAll('.handle').forEach(h => h.remove());

            if (!selectedHotspotId) return;

            const hotspot = hotspots.find(h => h.id === selectedHotspotId);
            if (!hotspot) return;

            const imageWidth = vehicleImage.width;
            const imageHeight = vehicleImage.height;

            hotspot.points.forEach((point, index) => {
                const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                handle.setAttribute('cx', point.x * imageWidth);
                handle.setAttribute('cy', point.y * imageHeight);
                    handle.setAttribute('r', 8);
                handle.setAttribute('class', 'handle');
                handle.dataset.hotspotId = selectedHotspotId;
                handle.dataset.pointIndex = index;
                hotspotSvg.appendChild(handle);
            });
        }


        function toggleEditMode() {
            isEditMode = !isEditMode;
            editorPanel.classList.toggle('open');
            if (!isEditMode) {
                // Exit any ongoing drawing
                if (isDrawing) {
                    resetDrawingState();
                }
                selectHotspot(null);
            }
            updateHotspotList();
        }

        function updateHotspotList() {
            hotspotList.innerHTML = '';
            if (hotspots.length === 0) {
                hotspotList.innerHTML = '<p class="text-gray-400">No hay hotspots.</p>';
                return;
            }

            hotspots.forEach(hotspot => {
                const item = document.createElement('div');
                item.className = `p-2 rounded cursor-pointer hover:bg-gray-600 ${selectedHotspotId === hotspot.id ? 'bg-blue-800' : ''}`;
                item.textContent = hotspot.name;
                item.dataset.id = hotspot.id;
                item.addEventListener('click', () => {
                    selectHotspot(hotspot.id);
                    showHotspotForm(hotspot.id);
                });
                hotspotList.appendChild(item);
            });
        }

        function showHotspotForm(hotspotId) {
            const hotspot = hotspots.find(h => h.id === hotspotId);
            if (!hotspot) return;

            document.getElementById('hotspot-id').value = hotspot.id;
            document.getElementById('hotspot-name').value = hotspot.name;
            document.getElementById('hotspot-partNumber').value = hotspot.partNumber;
            document.getElementById('hotspot-description').value = hotspot.description;
            document.getElementById('hotspot-imageUrl').value = hotspot.imageUrl;

            // Prepend the form to the editor panel for visibility
            const editorPanelContent = editorPanel.querySelector('.space-y-4.mb-6');
            editorPanel.insertBefore(hotspotFormContainer, editorPanelContent.nextSibling);

            hotspotFormContainer.classList.remove('hidden');
            deleteHotspotBtn.classList.remove('hidden');
        }

        function hideHotspotForm() {
            hotspotFormContainer.classList.add('hidden');
            deleteHotspotBtn.classList.add('hidden');
            document.getElementById('hotspot-form').reset();
        }


        closePanelBtn.addEventListener('click', closePanel);
        editModeBtn.addEventListener('click', toggleEditMode);
        closeEditorBtn.addEventListener('click', toggleEditMode);

        hotspotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('hotspot-id').value;
            const hotspot = hotspots.find(h => h.id === id);
            if (hotspot) {
                hotspot.name = document.getElementById('hotspot-name').value;
                hotspot.partNumber = document.getElementById('hotspot-partNumber').value;
                hotspot.description = document.getElementById('hotspot-description').value;
                hotspot.imageUrl = document.getElementById('hotspot-imageUrl').value;
            }
            hideHotspotForm();
            updateHotspotList();
        });

        cancelEditBtn.addEventListener('click', hideHotspotForm);

        deleteHotspotBtn.addEventListener('click', () => {
            if (!selectedHotspotId) return;

            if (confirm('¿Estás seguro de que quieres eliminar este hotspot?')) {
                hotspots = hotspots.filter(h => h.id !== selectedHotspotId);
                selectHotspot(null);
                hideHotspotForm();
                drawHotspots();
                updateHotspotList();
            }
        });

        addHotspotBtn.addEventListener('click', () => {
            isDrawing = true;
            hotspotSvg.classList.add('drawing-mode');
            addHotspotBtn.classList.add('hidden');
            finishHotspotBtn.classList.remove('hidden');
        });

        finishHotspotBtn.addEventListener('click', finishDrawing);

        exportJsonBtn.addEventListener('click', () => {
            const jsonString = JSON.stringify(hotspots, null, 2);
            jsonConfig.value = jsonString;
        });

        importJsonBtn.addEventListener('click', () => {
            try {
                const newHotspots = JSON.parse(jsonConfig.value);
                if (Array.isArray(newHotspots)) {
                    hotspots = newHotspots;
                    drawHotspots();
                    updateHotspotList();
                    selectHotspot(null);
                    hideHotspotForm();
                    alert('Configuración importada con éxito.');
                } else {
                    alert('El JSON importado no es un array válido.');
                }
            } catch (error) {
                alert('Error al parsear el JSON: ' + error.message);
            }
        });


        // --- Initialization ---
        function init() {
            if (vehicleImage.complete) {
                drawHotspots();
            } else {
                vehicleImage.onload = drawHotspots;
            }
            document.addEventListener('keydown', handlePanelKeyboard);
        }

        window.addEventListener('resize', drawHotspots);

        init();
    });
})();

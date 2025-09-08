document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const image = document.getElementById('vehicle-image');
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');

    const newPolygonBtn = document.getElementById('new-polygon-btn');
    const undoPointBtn = document.getElementById('undo-point-btn');
    const finishPolygonBtn = document.getElementById('finish-polygon-btn');
    const downloadJsonBtn = document.getElementById('download-json-btn');

    const polygonList = document.getElementById('polygon-list');
    const noPolygonsMsg = document.getElementById('no-polygons-msg');

    const modal = document.getElementById('polygon-modal');
    const polygonForm = document.getElementById('polygon-form');
    const polygonIdInput = document.getElementById('polygon-id');
    const partNameInput = document.getElementById('part-name');
    const partDescriptionInput = document.getElementById('part-description');
    const partNumberInput = document.getElementById('part-number');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // --- State ---
    let polygons = [];
    let currentPoints = [];
    let isDrawing = false;
    let selectedPolygonId = null;

    // --- Canvas & Drawing Logic ---

    function setupCanvas() {
        canvas.width = image.offsetWidth;
        canvas.height = image.offsetHeight;
        draw();
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw all saved polygons
        polygons.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let i = 1; i < p.points.length; i++) {
                ctx.lineTo(p.points[i].x, p.points[i].y);
            }
            ctx.closePath();

            if (p.id === selectedPolygonId) {
                ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
                ctx.strokeStyle = '#FFC800';
                ctx.lineWidth = 2;
            } else {
                ctx.fillStyle = 'rgba(0, 123, 255, 0.3)';
                ctx.strokeStyle = '#007BFF';
                ctx.lineWidth = 1;
            }
            ctx.fill();
            ctx.stroke();
        });

        // Draw the polygon currently being created
        if (isDrawing && currentPoints.length > 0) {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
            currentPoints.forEach((point, index) => {
                ctx.lineTo(point.x, point.y);
                ctx.strokeRect(point.x - 3, point.y - 3, 6, 6);
            });
            ctx.stroke();
        }
    }

    // --- Event Handlers ---

    canvas.addEventListener('click', (e) => {
        if (!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        currentPoints.push({ x, y });
        updateButtonStates();
        draw();
    });

    // --- Control Button & Form Logic ---

    newPolygonBtn.addEventListener('click', () => {
        isDrawing = true;
        currentPoints = [];
        selectedPolygonId = null;
        updateButtonStates();
        updatePolygonList();
        draw();
    });

    undoPointBtn.addEventListener('click', () => {
        if (currentPoints.length > 0) {
            currentPoints.pop();
            draw();
        }
        updateButtonStates();
    });

    finishPolygonBtn.addEventListener('click', () => {
        if (currentPoints.length < 3) {
            alert('Un polígono debe tener al menos 3 puntos.');
            return;
        }
        isDrawing = false;
        const newId = Date.now();
        const newPolygon = {
            id: newId,
            points: [...currentPoints],
            name: `Nueva Zona #${polygons.length + 1}`,
            description: '',
            partNumber: ''
        };
        polygons.push(newPolygon);
        currentPoints = [];
        selectedPolygonId = newId;

        updatePolygonList();
        updateButtonStates();
        draw();
        openModal(newId);
    });

    downloadJsonBtn.addEventListener('click', () => {
        const dataStr = JSON.stringify(polygons, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = 'hotspots.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    });

    polygonForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt(polygonIdInput.value);
        const polygon = polygons.find(p => p.id === id);
        if (polygon) {
            polygon.name = partNameInput.value;
            polygon.description = partDescriptionInput.value;
            polygon.partNumber = partNumberInput.value;
            updatePolygonList();
        }
        closeModal();
    });

    cancelEditBtn.addEventListener('click', closeModal);

    // --- UI Update Functions ---

    function updatePolygonList() {
        polygonList.innerHTML = '';
        if (polygons.length === 0) {
            polygonList.appendChild(noPolygonsMsg);
        } else {
            polygons.forEach(p => {
                const item = document.createElement('div');
                item.className = 'polygon-list-item flex justify-between items-center p-2 border rounded-md cursor-pointer transition-colors';
                if (p.id === selectedPolygonId) {
                    item.classList.add('bg-blue-100', 'border-blue-400');
                }

                item.innerHTML = `
                    <span class="font-medium text-slate-700">${p.name}</span>
                    <div>
                        <button class="edit-btn text-blue-600 hover:text-blue-800" data-id="${p.id}" title="Editar">&#9998;</button>
                        <button class="delete-btn text-red-600 hover:text-red-800 ml-2" data-id="${p.id}" title="Eliminar">&#128465;</button>
                    </div>
                `;

                item.addEventListener('click', (e) => {
                    if (e.target.closest('.edit-btn') || e.target.closest('.delete-btn')) return;
                    selectedPolygonId = p.id;
                    isDrawing = false;
                    currentPoints = [];
                    updatePolygonList();
                    updateButtonStates();
                    draw();
                });

                item.querySelector('.edit-btn').addEventListener('click', () => openModal(p.id));

                item.querySelector('.delete-btn').addEventListener('click', () => {
                    if (confirm(`¿Estás seguro de que quieres eliminar "${p.name}"?`)) {
                        polygons = polygons.filter(poly => poly.id !== p.id);
                        if (selectedPolygonId === p.id) selectedPolygonId = null;
                        updatePolygonList();
                        updateButtonStates();
                        draw();
                    }
                });

                polygonList.appendChild(item);
            });
        }
    }

    function openModal(polygonId) {
        const polygon = polygons.find(p => p.id === polygonId);
        if (!polygon) return;

        polygonIdInput.value = polygon.id;
        partNameInput.value = polygon.name;
        partDescriptionInput.value = polygon.description;
        partNumberInput.value = polygon.partNumber;

        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    function updateButtonStates() {
        undoPointBtn.disabled = !isDrawing || currentPoints.length === 0;
        finishPolygonBtn.disabled = !isDrawing || currentPoints.length < 3;
        downloadJsonBtn.disabled = polygons.length === 0;
        newPolygonBtn.disabled = isDrawing;
    }

    // --- Initialization ---
    window.addEventListener('resize', setupCanvas);
    image.onload = () => {
        setupCanvas();
        updateButtonStates();
        updatePolygonList();
    };
    if (image.complete) {
        image.onload();
    }
});

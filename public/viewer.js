document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const image = document.getElementById('vehicle-image');
    const canvas = document.getElementById('viewer-canvas');
    const ctx = canvas.getContext('2d');
    const jsonUpload = document.getElementById('json-upload');
    const infoContent = document.getElementById('info-content');
    const initialMessage = document.getElementById('initial-message');
    const canvasContainer = document.getElementById('canvas-container');

    // --- State ---
    let polygons = [];
    let activePolygon = null;

    // --- Canvas & Drawing ---
    function setupCanvas() {
        canvas.width = image.offsetWidth;
        canvas.height = image.offsetHeight;
        draw();
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        polygons.forEach(p => {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let i = 1; i < p.points.length; i++) {
                ctx.lineTo(p.points[i].x, p.points[i].y);
            }
            ctx.closePath();

            if (p.id === activePolygon?.id) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
                ctx.strokeStyle = '#FFFF00';
                ctx.lineWidth = 3;
                ctx.fill();
                ctx.stroke();
            } else {
                // Optional: draw a very subtle hint of the polygons
                // ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                // ctx.fill();
            }
        });
    }

    // --- Point-in-Polygon Algorithm ---
    function isInside(point, vs) {
        const x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // --- Event Handlers ---
    jsonUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                polygons = JSON.parse(event.target.result);
                if (Array.isArray(polygons)) {
                    initialMessage.textContent = '¡Configuración cargada! Pase el cursor sobre la imagen.';
                    draw(); // Draw initial state if needed
                } else {
                    throw new Error('El archivo JSON debe contener un array de polígonos.');
                }
            } catch (err) {
                alert('Error al procesar el archivo JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    });

    canvasContainer.addEventListener('mousemove', (e) => {
        if (polygons.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const mousePoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        let foundPolygon = null;
        // Iterate backwards to prioritize polygons drawn on top
        for (let i = polygons.length - 1; i >= 0; i--) {
            if (isInside(mousePoint, polygons[i].points)) {
                foundPolygon = polygons[i];
                break;
            }
        }

        if (activePolygon?.id !== foundPolygon?.id) {
            activePolygon = foundPolygon;
            updateInfoPanel(activePolygon);
            draw();
        }
    });

    // --- UI Updates ---
    function updateInfoPanel(polygon) {
        // Use a placeholder div to measure content height and animate smoothly
        const placeholder = document.createElement('div');
        placeholder.style.visibility = 'hidden';
        placeholder.style.position = 'absolute';

        if (polygon) {
            placeholder.innerHTML = generateInfoHtml(polygon);
        } else {
            placeholder.innerHTML = generateDefaultHtml();
        }
        document.body.appendChild(placeholder);
        // Animate panel height if needed, for now we rely on CSS transitions on content

        infoContent.innerHTML = placeholder.innerHTML;
        document.body.removeChild(placeholder);
    }

    function generateInfoHtml(polygon) {
        return `
            <div class="info-content-item">
                <h2 class="text-3xl font-bold text-yellow-400 border-b-2 border-yellow-500 pb-2 mb-6">${polygon.name}</h2>
                <p class="text-gray-300 mb-4">${polygon.description}</p>
                <div class="bg-gray-700 p-3 rounded-lg">
                    <span class="font-bold text-gray-400">Número de Parte:</span>
                    <span class="font-mono text-lg text-white">${polygon.partNumber}</span>
                </div>
            </div>
        `;
    }

    function generateDefaultHtml() {
        return `
            <div class="info-content-item">
                <h2 class="text-3xl font-bold text-blue-400 border-b-2 border-blue-500 pb-2 mb-6">Demostración Interactiva</h2>
                <p class="text-gray-300">Pase el cursor sobre una zona activa en la imagen.</p>
                <hr class="border-gray-600 my-6">
                <p class="text-sm text-gray-500">Para crear o modificar zonas, use el <a href="editor.html" target="_blank" class="text-blue-400 hover:underline">Editor de Hotspots</a>.</p>
            </div>
        `;
    }

    // --- Initialization ---
    window.addEventListener('resize', setupCanvas);
    image.onload = setupCanvas;
    if (image.complete) {
        image.onload();
    }
});

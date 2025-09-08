document.addEventListener('DOMContentLoaded', () => {
    const imageContainer = document.querySelector('.image-container');
    const partInfoContainer = document.getElementById('part-info');
    const vehicleImage = imageContainer.querySelector('img');

    // Data for vehicle parts, with estimated coordinates
    const partsData = [
        {
            id: 'hood',
            name: 'Capó Reforzado',
            description: 'Capó con diseño aerodinámico y estructura reforzada para mayor seguridad y durabilidad. Acabado con pintura de alta resistencia.',
            partNumber: 'MXS-CAP-001A',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Capó+Reforzado',
            coords: '381,288 514,292 498,367 383,356'
        },
        {
            id: 'front-bumper',
            name: 'Parachoques Delantero',
            description: 'Parachoques de polímero de alta densidad, diseñado para absorber impactos y proteger los componentes internos del vehículo.',
            partNumber: 'MXS-PCD-002B',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Parachoques+Delantero',
            coords: '382,460 541,463 540,500 383,491'
        },
        {
            id: 'headlight',
            name: 'Faro Delantero LED',
            description: 'Sistema de faro con tecnología LED de última generación para una visibilidad óptima y un bajo consumo de energía.',
            partNumber: 'MXS-FAR-003C',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Faro+Delantero+LED',
            coords: '382,367 430,369 428,401 384,396'
        },
        {
            id: 'front-door',
            name: 'Puerta Delantera',
            description: 'Puerta delantera completa, incluye panel interior y anclajes para el sistema de elevalunas. Construcción robusta y ajuste de fábrica.',
            partNumber: 'MXS-PTD-004D',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Puerta+Delantera',
            coords: '522,301 620,306 618,502 523,493'
        },
        {
            id: 'side-mirror',
            name: 'Espejo Lateral Eléctrico',
            description: 'Espejo retrovisor con ajuste eléctrico y calefacción para desempañado. Carcasa aerodinámica para reducir el ruido del viento.',
            partNumber: 'MXS-ESP-005E',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Espejo+Lateral',
            coords: '502,360 521,363 519,398 503,394'
        },
        {
            id: 'sliding-door',
            name: 'Puerta Lateral Corrediza',
            description: 'Puerta corrediza de gran apertura para facilitar la carga y descarga. Sistema de rieles de alta resistencia para un deslizamiento suave.',
            partNumber: 'MXS-PLC-006F',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Puerta+Corrediza',
            coords: '627,309 780,314 775,508 626,504'
        },
        {
            id: 'front-wheel',
            name: 'Rueda Delantera',
            description: 'Conjunto de llanta de aleación y neumático de alto rendimiento, balanceado y listo para montar. Ideal para todo tipo de condiciones.',
            partNumber: 'MXS-RDD-007G',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Rueda+Delantera',
            coords: '460,508 460,560 520,560 520,508' // This is a square, should be a circle or more points
        },
        {
            id: 'rear-wheel',
            name: 'Rueda Trasera',
            description: 'Conjunto de llanta de aleación y neumático de carga, diseñado para soportar el peso y ofrecer una tracción excelente.',
            partNumber: 'MXS-RDT-008H',
            imageUrl: 'https://via.placeholder.com/300x200.png?text=Rueda+Trasera',
            coords: '798,514 798,566 858,566 858,514' // This is a square, should be a circle or more points
        }
    ];

    function displayPartInfo(part) {
        partInfoContainer.classList.add('is-updating');

        setTimeout(() => {
            if (part) {
                partInfoContainer.innerHTML = `
                    <h2>${part.name}</h2>
                    <img src="${part.imageUrl}" alt="${part.name}">
                    <p>${part.description}</p>
                    <p><strong>Número de Parte:</strong> ${part.partNumber}</p>
                `;
            } else {
                partInfoContainer.innerHTML = `
                    <h2>Seleccione una pieza</h2>
                    <p>Pase el cursor y haga clic en una parte del vehículo para ver los detalles.</p>
                `;
            }
            partInfoContainer.classList.remove('is-updating');
        }, 300); // Matches the CSS transition time
    }

    function initializeHotspots() {
        if (vehicleImage.complete) {
            createSVGHotspots();
        } else {
            vehicleImage.onload = createSVGHotspots;
        }
    }

    function createSVGHotspots() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const naturalWidth = vehicleImage.naturalWidth;
        const naturalHeight = vehicleImage.naturalHeight;

        // A safety check in case the image hasn't loaded and dimensions are zero
        if(naturalWidth === 0 || naturalHeight === 0) {
            console.error("Image dimensions are not available.");
            return;
        }

        svg.setAttribute('viewBox', `0 0 ${naturalWidth} ${naturalHeight}`);
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';

        partsData.forEach(part => {
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', part.coords);
            polygon.setAttribute('class', 'hotspot');
            polygon.setAttribute('data-part-id', part.id);
            polygon.style.pointerEvents = 'all';

            polygon.addEventListener('click', () => {
                displayPartInfo(part);
            });

            svg.appendChild(polygon);
        });

        imageContainer.appendChild(svg);
    }

    // Initial state
    displayPartInfo(null);
    initializeHotspots();
});

$(document).ready(function() {
    const image = $('.vehicle-image');
    const canvas = $('#highlight-canvas')[0];
    const ctx = canvas.getContext('2d');
    const partInfoContainer = $('#part-info .part-info-content');

    // --- PART DATABASE ---
    // The keys should match the 'data-part-key' attribute in the <area> tags.
    const partsData = {
        'capo': {
            name: 'Capó Delantero Reforzado',
            description: 'Un capó de alta calidad, diseñado para un ajuste perfecto y una durabilidad excepcional. Incluye aislamiento acústico y térmico.',
            partNumber: 'MXS-CAP-02B',
            imageUrl: 'https://via.placeholder.com/400x300.png?text=Capó'
        },
        'parachoques': {
            name: 'Parachoques Delantero de Polímero',
            description: 'Parachoques robusto que ofrece máxima protección y un diseño aerodinámico. Fabricado con polímeros de alta densidad para absorber impactos.',
            partNumber: 'MXS-BUMP-04D',
            imageUrl: 'https://via.placeholder.com/400x300.png?text=Parachoques'
        },
        'puerta_delantera': {
            name: 'Puerta Delantera Completa',
            description: 'Puerta delantera completa, construcción robusta y ajuste de fábrica. Compatible con sistemas de elevalunas eléctricos y cierre centralizado.',
            partNumber: 'MXS-PTD-03C',
            imageUrl: 'https://via.placeholder.com/400x300.png?text=Puerta+Delantera'
        },
        'puerta_lateral': {
            name: 'Puerta Lateral Corrediza',
            description: 'Puerta corrediza de gran apertura para facilitar la carga y descarga. Sistema de rieles de alta resistencia para un deslizamiento suave y seguro.',
            partNumber: 'MXS-PSL-05E',
            imageUrl: 'https://via.placeholder.com/400x300.png?text=Puerta+Lateral'
        },
        'faro': {
            name: 'Faro Delantero LED',
            description: 'Sistema de faro con tecnología LED de última generación para una visibilidad óptima, bajo consumo de energía y una larga vida útil.',
            partNumber: 'MXS-FAR-06F',
            imageUrl: 'https://via.placeholder.com/400x300.png?text=Faro+LED'
        }
    };

    function resizeCanvas() {
        canvas.width = image.width();
        canvas.height = image.height();
    }

    function drawHighlight(area) {
        const coords = area.attr('coords').split(',').map(Number);
        const shape = area.attr('shape');

        // Calculate responsive coordinates
        const nativeWidth = image[0].naturalWidth;
        const nativeHeight = image[0].naturalHeight;
        const currentWidth = image.width();
        const currentHeight = image.height();

        const widthRatio = currentWidth / nativeWidth;
        const heightRatio = currentHeight / nativeHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();

        if (shape === 'rect') {
            const [x1, y1, x2, y2] = coords;
            ctx.rect(x1 * widthRatio, y1 * heightRatio, (x2 - x1) * widthRatio, (y2 - y1) * heightRatio);
        } else if (shape === 'poly') {
            for (let i = 0; i < coords.length; i += 2) {
                const x = coords[i] * widthRatio;
                const y = coords[i + 1] * heightRatio;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        }

        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; // Semi-transparent yellow
        ctx.strokeStyle = '#FFFF00';
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
    }

    function clearHighlight() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function updatePartInfo(partKey) {
        const part = partsData[partKey];
        partInfoContainer.addClass('is-loading');

        setTimeout(() => {
            if (part) {
                const newContent = `
                    <h3>${part.name}</h3>
                    <img src="${part.imageUrl}" alt="${part.name}" class="part-image">
                    <p class="part-description">${part.description}</p>
                    <div class="part-number">N/P: ${part.partNumber}</div>
                `;
                partInfoContainer.html(newContent);
            } else {
                 partInfoContainer.html(`
                    <h2>Pieza no encontrada</h2>
                    <p>No hay datos disponibles para la zona seleccionada.</p>
                 `);
            }
            partInfoContainer.removeClass('is-loading');
        }, 300); // Match CSS transition
    }

    // --- Event Listeners ---
    $('map[name="vehicle-map"] area').on('mouseenter', function() {
        drawHighlight($(this));
        const partKey = $(this).data('part-key');
        if(partKey) {
            updatePartInfo(partKey);
        }
    });

    $('map[name="vehicle-map"] area').on('mouseleave', function() {
        clearHighlight();
    });

    // --- Initialization ---
    // Resize canvas when the image is loaded and when the window is resized
    image.on('load', function() {
        resizeCanvas();
        // Re-attach listeners if map was added dynamically after page load
    }).each(function() {
        if (this.complete) {
            $(this).trigger('load');
        }
    });

    $(window).on('resize', function() {
        resizeCanvas();
    });

});

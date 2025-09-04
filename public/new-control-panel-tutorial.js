/**
 * **New and Improved** Interactive Tutorial Module for the ECR/ECO Control Panel
 * Generated based on AI-provided steps.
 */
const newControlPanelTutorial = (app) => {
    let currentStepIndex = 0;
    let steps = [];

    const dom = {
        overlay: null,
        tooltip: null,
        highlight: null,
    };

    // Steps for the improved tutorial
    const TUTORIAL_STEPS = [
        {
            element: 'body',
            title: '¡Bienvenido al Nuevo Panel de Control!',
            content: 'Este tour interactivo te mostrará las potentes herramientas de gestión de cambios de ingeniería. ¡Comencemos!',
            position: 'center',
            preAction: async () => { await app.switchView('control_ecrs'); }
        },
        {
            element: '[data-tutorial-id="control-panel-container"]',
            title: 'Tres Módulos Centrales',
            content: 'El panel ahora se organiza en tres módulos especializados: la <strong>Tabla de Control</strong> para análisis detallado, los <strong>Indicadores (KPIs)</strong> para una vista gerencial, y el <strong>Seguimiento de Reuniones</strong> para la gestión del equipo.',
            position: 'top'
        },
        {
            element: '[data-tutorial-id="control-panel-card-table"]',
            title: '1. Tabla de Control ECR',
            content: 'Esta es la vista principal para el análisis profundo. Ha sido rediseñada para ofrecer una experiencia de filtrado más potente y amigable.',
            position: 'bottom'
        },
        {
            element: '[data-tutorial-id="ecr-table-view-container"]',
            title: 'Filtros Inteligentes y Búsqueda Rápida',
            content: 'La nueva sección de filtros te permite encontrar la información que necesitas de manera más rápida y eficiente.',
            position: 'top',
            preAction: async () => { await app.switchView('ecr_table_view'); }
        },
        {
            element: '.filters-container',
            title: 'Disposición Lógica y Agrupada',
            content: 'Los filtros están organizados en grupos claros: <strong>Búsqueda General</strong>, <strong>Filtros Específicos</strong> y <strong>Acciones</strong>. Las etiquetas ahora están encima de cada campo para mayor claridad.',
            position: 'bottom'
        },
        {
            element: '#active-filters-indicator',
            title: 'Contador de Filtros Activos',
            content: 'Este práctico contador te informa cuántos filtros están aplicados, para que nunca pierdas el contexto de tu búsqueda.',
            position: 'left'
        },
        {
            element: '#clear-filters-btn',
            title: 'Limpiar Filtros',
            content: 'Con un solo clic, puedes restablecer todos los filtros y volver a la vista completa de todos los ECRs.',
            position: 'left'
        },
        {
            element: '.ecr-control-table-wrapper',
            title: 'Tabla Desplazable',
            content: 'La tabla completa puede ser muy ancha. Utiliza esta manija de agarre para desplazarte horizontalmente y ver todas las columnas. ¡Arrastra hacia la izquierda o derecha!',
            position: 'bottom'
        },
        {
            element: '[data-tutorial-id="control-panel-card-indicators"]',
            title: '2. Indicadores de Gestión (ECM)',
            content: 'Este módulo ofrece una vista de alto nivel del rendimiento del proceso de cambios (ECM), con KPIs sobre ECRs y ECOs.',
            position: 'top',
            preAction: async () => { await app.switchView('control_ecrs'); }
        },
        {
            element: '[data-tutorial-id="indicadores-ecm-view-container"]',
            title: 'Dashboard de Indicadores (ECM)',
            content: 'Este es el dashboard de ECM. Aquí puedes analizar métricas y KPIs sobre el proceso de ECRs y ECOs para identificar cuellos de botella y medir la eficiencia.',
            position: 'center',
            preAction: async () => { await app.switchView('indicadores_ecm_view'); }
        },
        {
            element: '[data-tutorial-id="control-panel-card-metrics"]',
            title: '3. Seguimiento y Métricas',
            content: 'Finalmente, este módulo es para la gestión del equipo. Permite registrar la asistencia a reuniones y visualizar KPIs de ausentismo.',
            position: 'top',
            preAction: async () => { await app.switchView('control_ecrs'); }
        },
        {
            element: '[data-tutorial-id="ecr-seguimiento-view-container"]',
            title: 'Dashboard de Seguimiento',
            content: 'Aquí puedes registrar la asistencia a las reuniones de ECR y ver gráficos sobre la participación de cada departamento.',
            position: 'center',
            preAction: async () => { await app.switchView('ecr_seguimiento'); }
        },
        {
            element: 'body',
            title: '¡Tutorial Completado!',
            content: '¡Felicidades! Has explorado las nuevas funcionalidades del Panel de Control. Ahora tienes herramientas más poderosas para gestionar el ciclo de vida de los cambios de ingeniería.',
            position: 'center',
            preAction: async () => { await app.switchView('control_ecrs'); }
        }
    ];

    const createTutorialUI = () => {
        dom.overlay = document.createElement('div');
        dom.overlay.id = 'tutorial-overlay';
        dom.highlight = document.createElement('div');
        dom.highlight.id = 'tutorial-highlight';
        dom.overlay.appendChild(dom.highlight);
        dom.tooltip = document.createElement('div');
        dom.tooltip.id = 'tutorial-tooltip';
        dom.tooltip.innerHTML = `
            <div id="tutorial-tooltip-content">
                <h3 id="tutorial-tooltip-title"></h3>
                <p id="tutorial-tooltip-text"></p>
            </div>
            <div id="tutorial-tooltip-nav">
                <div id="tutorial-tooltip-progress"></div>
                <div id="tutorial-nav-buttons">
                    <button id="tutorial-skip-btn">Omitir</button>
                    <div id="tutorial-nav-right">
                        <button id="tutorial-prev-btn">Anterior</button>
                        <button id="tutorial-next-btn">Siguiente</button>
                    </div>
                </div>
            </div>
        `;
        dom.overlay.appendChild(dom.tooltip);
        document.body.appendChild(dom.overlay);
        document.getElementById('tutorial-skip-btn').addEventListener('click', skip);
        document.getElementById('tutorial-prev-btn').addEventListener('click', previous);
        document.getElementById('tutorial-next-btn').addEventListener('click', next);
    };

    const waitForVisibleElement = (selector, timeout = 7000) => {
        return new Promise(resolve => {
            if (selector === 'body') return resolve(document.body);
            const interval = 100;
            let elapsedTime = 0;
            const timer = setInterval(() => {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    clearInterval(timer);
                    resolve(element);
                } else {
                    elapsedTime += interval;
                    if (elapsedTime >= timeout) {
                        clearInterval(timer);
                        resolve(null);
                    }
                }
            }, interval);
        });
    };

    let resizeObserver = null;
    let scrollHandler = null;

    const updateHighlight = (targetElement, step) => {
        if (!targetElement || !dom.highlight) return;
        const targetRect = targetElement.getBoundingClientRect();
        const padding = 5;
        dom.highlight.style.width = `${targetRect.width + padding * 2}px`;
        dom.highlight.style.height = `${targetRect.height + padding * 2}px`;
        dom.highlight.style.top = `${targetRect.top - padding}px`;
        dom.highlight.style.left = `${targetRect.left - padding}px`;
        positionTooltip(targetRect, step.position);
    };

    const showStep = async (index) => {
        if (resizeObserver) resizeObserver.disconnect();
        if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true);

        if (index < 0 || index >= steps.length) return skip();

        currentStepIndex = index;
        const step = steps[index];

        if (dom.overlay) {
            dom.overlay.style.display = 'none';
        }

        if (step.preAction) await step.preAction();

        const targetElement = await waitForVisibleElement(step.element);

        if (dom.overlay) {
            dom.overlay.style.display = 'block';
        }
        if (!targetElement) {
            app.showToast(`Elemento del tutorial no encontrado: ${step.element}`, 'error');
            return next();
        }

        await smartScroll(targetElement);

        // The setTimeout wrapper has been removed. By awaiting a properly implemented
        // smartScroll, we ensure the highlight is drawn after the element is in place.
        document.getElementById('tutorial-tooltip-title').textContent = step.title;
        document.getElementById('tutorial-tooltip-text').innerHTML = step.content;
        document.getElementById('tutorial-prev-btn').style.display = index === 0 ? 'none' : 'inline-block';
        document.getElementById('tutorial-next-btn').textContent = index === steps.length - 1 ? 'Finalizar' : 'Siguiente';
        document.getElementById('tutorial-tooltip-progress').textContent = `Paso ${index + 1} de ${steps.length}`;
        updateHighlight(targetElement, step);
        resizeObserver = new ResizeObserver(() => updateHighlight(targetElement, step));
        resizeObserver.observe(targetElement);
        window.addEventListener('scroll', scrollHandler = () => updateHighlight(targetElement, step), true);
    };

    const smartScroll = (element) => {
        return new Promise(resolve => {
            const rect = element.getBoundingClientRect();
            const isVisible = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );

            if (!isVisible) {
                element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                // We wait for two animation frames to ensure the browser has painted the change.
                requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                });
            } else {
                resolve();
            }
        });
    };

    const positionTooltip = (targetRect, position = 'bottom') => {
        const tooltipRect = dom.tooltip.getBoundingClientRect();
        const spacing = 10;
        let top, left;
        let finalPosition = position;

        // Try to flip right to left if there's no space
        if (position === 'right' && (targetRect.right + spacing + tooltipRect.width > window.innerWidth)) {
            finalPosition = 'left';
        }
        // Try to flip left to right if there's no space
        if (position === 'left' && (targetRect.left - spacing - tooltipRect.width < 0)) {
            finalPosition = 'right';
        }
        // Try to flip top to bottom if there's no space
        if (position === 'top' && (targetRect.top - spacing - tooltipRect.height < 0)) {
            finalPosition = 'bottom';
        }
        // Try to flip bottom to top if there's no space
        if (position === 'bottom' && (targetRect.bottom + spacing + tooltipRect.height > window.innerHeight)) {
            finalPosition = 'top';
        }

        // Calculate position based on the (potentially flipped) finalPosition
        switch (finalPosition) {
            case 'top':
                top = targetRect.top - tooltipRect.height - spacing;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + spacing;
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - spacing;
                break;
            case 'bottom':
            default:
                top = targetRect.bottom + spacing;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
        }

        // --- Final Boundary Enforcement ---
        // Ensure the tooltip never goes out of bounds, no matter what.
        if (left < spacing) {
            left = spacing;
        }
        if (left + tooltipRect.width > window.innerWidth - spacing) {
            left = window.innerWidth - tooltipRect.width - spacing;
        }
        if (top < spacing) {
            top = spacing;
        }
        if (top + tooltipRect.height > window.innerHeight - spacing) {
            top = window.innerHeight - tooltipRect.height - spacing;
        }

        dom.tooltip.style.top = `${top}px`;
        dom.tooltip.style.left = `${left}px`;
    };

    const start = async () => {
        if (dom.overlay) return;
        if (app && typeof app.seedControlPanelTutorialData === 'function') {
            await app.seedControlPanelTutorialData();
        }
        steps = TUTORIAL_STEPS;
        createTutorialUI();
        dom.overlay.style.display = 'block';
        await showStep(0);
    };

    const next = async () => {
        await showStep(currentStepIndex + 1);
    };

    const previous = async () => {
        await showStep(currentStepIndex - 1);
    };

    const skip = () => {
        if (resizeObserver) resizeObserver.disconnect();
        if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true);
        if (dom.overlay) dom.overlay.remove();
        dom.overlay = null;
        if (app && typeof app.onTutorialEnd === 'function') {
            app.onTutorialEnd();
        }
    };

    return { start, skip };
};

export default newControlPanelTutorial;

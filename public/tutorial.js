/**
 * @file Interactive Tutorial Module for the ECR/ECO Workflow.
 * @description This module provides a step-by-step guided tour for new users to
 * understand the core process of creating and managing Engineering Change Requests (ECR)
 * and Engineering Change Orders (ECO). It highlights UI elements and explains each
 * part of the process.
 * @module tutorial
 */

/**
 * Creates and manages an interactive tutorial instance.
 * @param {object} app - The main application object, providing access to core functions
 * like `switchView`, `showToast`, and the global `appState`.
 * @returns {object} A tutorial instance with `start` and `skip` methods.
 */
const tutorial = (app) => {
    let currentStepIndex = 0;
    let steps = [];

    /**
     * @property {HTMLElement|null} overlay - The main overlay element for the tutorial.
     * @property {HTMLElement|null} tooltip - The tooltip element to display step information.
     * @property {HTMLElement|null} highlight - The element used to highlight parts of the UI.
     */
    const dom = {
        overlay: null,
        tooltip: null,
        highlight: null,
    };

    /**
     * An array of tutorial step definitions. Each object defines a step in the tour.
     * @type {Array<object>}
     * @property {string} element - A CSS selector for the element to highlight.
     * @property {string} title - The title to display in the tooltip.
     * @property {string} content - The HTML content for the tooltip body.
     * @property {'top'|'bottom'|'left'|'right'|'center'} position - The preferred tooltip position.
     * @property {Function} [preAction] - An async function to run before the step is shown.
     * @property {Function} [postAction] - An async function to run after the step's action (e.g., a click).
     * @property {boolean} [click=false] - If true, simulates a click on the element before proceeding.
     */
    const TUTORIAL_STEPS = [
        {
            element: 'body',
            title: 'Bienvenido al Tutorial Interactivo',
            content: 'Este tour te guiará por el proceso de <strong>Gestión de Cambios de Ingeniería</strong>, desde la solicitud (ECR) hasta la orden de cambio (ECO). ¡Vamos a empezar!',
            position: 'center'
        },
        {
            element: '[data-tutorial-id="eco-ecr-menu"]',
            title: 'Módulo ECR/ECO',
            content: 'Toda la gestión de cambios de ingeniería empieza aquí. Este menú contiene las herramientas para solicitar, seguir y ejecutar cambios.',
            position: 'bottom',
            postAction: async () => {
                const menu = document.querySelector('[data-tutorial-id="eco-ecr-menu"]');
                if (menu) {
                    menu.classList.add('open');
                    await waitForVisibleElement('a[data-view="ecr"]');
                }
            }
        },
        {
            element: 'a[data-view="ecr"]',
            title: 'Gestión de Solicitudes (ECR)',
            content: 'Aquí es donde se crean y gestionan las <strong>Solicitudes de Cambio (ECR)</strong>. Un ECR es el primer paso para proponer una modificación.',
            position: 'right',
            click: true,
            postAction: async () => {
                await app.switchView('ecr');
                const menu = document.querySelector('[data-tutorial-id="eco-ecr-menu"]');
                if (menu) menu.classList.remove('open');
            }
        },
        {
            element: '#view-title',
            title: 'Panel de Control de ECRs',
            content: 'Esta tabla muestra todos los ECRs con su estado actual. Para proponer un nuevo cambio, crearemos un nuevo ECR.',
            position: 'bottom',
            preAction: async () => await app.switchView('ecr')
        },
        {
            element: '[data-tutorial-id="create-new-button"]',
            title: 'Crear un Nuevo ECR',
            content: 'Este botón abre el formulario para detallar una nueva solicitud de cambio. Le daremos un identificador único y describiremos la propuesta.',
            position: 'bottom',
            click: true,
            preAction: async () => await app.switchView('ecr'),
            postAction: async () => await app.switchView('ecr_form')
        },
        {
            element: '.ecr-header',
            title: 'Formulario de Solicitud de Cambio',
            content: 'En este formulario se documenta el <strong>qué</strong> y el <strong>porqué</strong> del cambio. Es crucial para que todos los departamentos puedan evaluarlo.',
            position: 'bottom',
            offset: { top: -15 }
        },
        {
            element: '.form-row',
            title: 'ECR: Origen y Metadatos',
            content: 'Se comienza identificando el origen del cambio (cliente, interno, etc.) y asociándolo a un proyecto y cliente. Estas fechas son clave para el seguimiento.',
            position: 'bottom'
        },
        {
            element: '[data-tutorial-id="situacion-layout"]',
            title: 'Situación Actual vs. Propuesta',
            content: 'Aquí se describe el problema o la situación actual y cómo se propone solucionarlo. Es el corazón de la solicitud.',
            position: 'top'
        },
        {
            element: '.risk-analysis-table',
            title: 'ECR: Análisis de Impacto y Riesgo',
            content: 'Antes de la evaluación departamental, se realiza un análisis de riesgo inicial para entender las posibles consecuencias de una falla.',
            position: 'top'
        },
        {
            element: '[data-tutorial-id="evaluacion-departamento"]',
            title: 'Evaluación de Impacto',
            content: 'Cada departamento afectado debe evaluar cómo le impacta el cambio. Esto asegura una visión 360° antes de aprobar nada.',
            position: 'top'
        },
        {
            element: '[data-tutorial-id="evaluacion-departamento"]',
            title: 'Circuito de Aprobación',
            content: 'Una vez evaluado, los responsables de cada área emiten su aprobación o rechazo. La decisión, el usuario y la fecha quedan registrados aquí.',
            position: 'top'
        },
        {
            element: '#action-buttons-container',
            title: 'Guardar o Enviar',
            content: 'Puedes guardar el ECR como borrador para continuarlo más tarde. Cuando esté listo, lo envías al circuito de aprobación para que sea evaluado.',
            position: 'top'
        },
        {
            element: '#view-title',
            title: 'Máquina de Estados del ECR',
            content: 'Una vez enviado, el estado del ECR cambia a <strong>"pending-approval"</strong>. Si todos aprueban, pasa a <strong>"approved"</strong>. Si uno solo rechaza, se marca como <strong>"rejected"</strong>.',
            position: 'center',
            preAction: async () => await app.switchView('ecr')
        },
        {
            element: '[data-tutorial-id="ecr-table-body"]',
            title: 'De Solicitud a Orden (ECO)',
            content: 'Cuando un ECR es aprobado, se habilita la opción de "Generar ECO". Esto convierte la solicitud en una <strong>Orden de Cambio (ECO)</strong>, que es el documento para ejecutar la modificación.',
            position: 'bottom'
        },
        {
            element: 'button[data-action="generate-eco-from-ecr"]',
            title: 'Generación del ECO',
            content: 'Para este ECR aprobado de ejemplo, el botón "Generar ECO" está activo. Al hacer clic, se crea la Orden de Cambio de Ingeniería (ECO) y nos lleva a su formulario.',
            position: 'left',
            postAction: async () => {
                const ecrData = await app.createTutorialEcr();
                if (ecrData) await app.switchView('eco_form', { ecrData: ecrData });
                else app.showToast('No se pudieron generar los datos del tutorial.', 'error');
                await waitForVisibleElement('#eco-form');
            }
        },
        {
            element: '#eco-form',
            title: 'Formulario de la Orden de Cambio (ECO)',
            content: 'Este es el formulario del ECO. A diferencia del ECR (la solicitud), el ECO se centra en la <strong>ejecución y el seguimiento</strong> del cambio. Su objetivo es documentar el "cómo" se implementará.',
            position: 'top'
        },
        {
            element: '[data-tutorial-id="ppap-container"]',
            title: 'Verificación de Pasos Críticos (PPAP)',
            content: 'Para pasos críticos como el PPAP, ahora se puede añadir un <strong>enlace de evidencia</strong>. Esto mejora la trazabilidad, pasando de una simple casilla de verificación a una confirmación verificable.',
            position: 'top'
        },
        {
            element: '.section-block:first-of-type',
            title: 'ECO: Checklists Departamentales',
            content: 'Cada departamento utiliza estas listas de verificación para confirmar que todas las acciones necesarias (actualizar planos, planes de control, etc.) se han completado antes del cierre del ECO.',
            position: 'top'
        },
        {
            element: '#action-plan-section',
            title: 'Plan de Acción: El Corazón del ECO',
            content: 'Esta es la sección más importante. Aquí se definen las tareas concretas para implementar el cambio. Vamos a añadir una tarea.',
            position: 'top',
        },
        {
            element: '[data-tutorial-id="add-action-item-form-container"]',
            title: 'Añadir Tareas al Plan',
            content: 'Utilice este formulario para añadir tareas. Puede describir la acción, asignar un responsable y fijar una fecha límite. Cada tarea aparecerá en la lista de arriba para su seguimiento.',
            position: 'top'
        },
        {
            element: '[data-tutorial-id="action-plan-completion-checkbox"]',
            title: 'Integración del Plan de Acción',
            content: '¡Nueva mejora! La primera opción de la sección "Implementación", "¿Plan de acción completado?", ahora se marca automáticamente cuando todas las tareas que definiste en el Plan de Acción están completas. Esto conecta la planificación con la ejecución.',
            position: 'top'
        },
        {
            element: '#eco-approve-button',
            title: 'Cierre del ECO',
            content: 'Una vez que todas las tareas del plan de acción están completas y las secciones del formulario han sido aprobadas, el ECO puede ser cerrado. Esto finaliza formalmente el proceso de cambio.',
            position: 'top'
        },
        {
            element: 'body',
            title: '¡Fin del Tutorial!',
            content: '¡Excelente! Ahora conoces el flujo completo de ECR/ECO. Este proceso asegura que los cambios de ingeniería se realizan de forma controlada y documentada.',
            position: 'center'
        }
    ];

    /**
     * Creates the main DOM elements for the tutorial (overlay, highlight, tooltip).
     */
    const createTutorialUI = () => {
        dom.overlay = document.createElement('div');
        dom.overlay.id = 'tutorial-overlay';
        dom.highlight = document.createElement('div');
        dom.highlight.id = 'tutorial-highlight';
        dom.overlay.appendChild(dom.highlight);
        dom.tooltip = document.createElement('div');
        dom.tooltip.id = 'tutorial-tooltip';
        dom.tooltip.innerHTML = `
            <div id="tutorial-tooltip-content"><h3 id="tutorial-tooltip-title"></h3><p id="tutorial-tooltip-text"></p></div>
            <div id="tutorial-tooltip-nav">
                <div id="tutorial-tooltip-progress" class="text-sm text-slate-500"></div>
                <div id="tutorial-nav-buttons">
                    <button id="tutorial-skip-btn">Omitir</button>
                    <div id="tutorial-nav-right"><button id="tutorial-prev-btn">Anterior</button><button id="tutorial-next-btn">Siguiente</button></div>
                </div>
            </div>`;
        dom.overlay.appendChild(dom.tooltip);
        document.body.appendChild(dom.overlay);
        document.getElementById('tutorial-skip-btn').addEventListener('click', skip);
        const prevBtn = document.getElementById('tutorial-prev-btn');
        prevBtn.addEventListener('click', async () => { prevBtn.disabled = true; try { await previous(); } finally { prevBtn.disabled = false; } });
        const nextBtn = document.getElementById('tutorial-next-btn');
        nextBtn.addEventListener('click', async () => { nextBtn.disabled = true; try { await next(); } finally { nextBtn.disabled = false; } });
    };

    /**
     * Waits for a specified element to become visible in the DOM.
     * @param {string} selector - The CSS selector for the element.
     * @param {number} [timeout=7000] - The maximum time to wait in milliseconds.
     * @returns {Promise<Element|null>} A promise that resolves with the element or null if it times out.
     */
    const waitForVisibleElement = (selector, timeout = 7000) => {
        return new Promise(resolve => {
            if (selector === 'body' && document.body) return resolve(document.body);
            let elapsedTime = 0;
            const interval = 100;
            const timer = setInterval(() => {
                const element = document.querySelector(selector);
                if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) {
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

    /**
     * Updates the position and size of the highlight element to match the target.
     * @param {Element} targetElement - The element to highlight.
     * @param {object} step - The current tutorial step object.
     */
    const updateHighlight = (targetElement, step) => {
        if (!targetElement || !dom.highlight) return;
        const targetRect = targetElement.getBoundingClientRect();
        const padding = 5;
        const offset = step.offset || { top: 0, left: 0 };
        dom.highlight.style.width = `${targetRect.width + (padding * 2)}px`;
        dom.highlight.style.height = `${targetRect.height + (padding * 2)}px`;
        dom.highlight.style.top = `${targetRect.top - padding + (offset.top || 0)}px`;
        dom.highlight.style.left = `${targetRect.left - padding + (offset.left || 0)}px`;
        positionTooltip(targetRect, step.position);
    };

    /**
     * Shows a specific step of the tutorial.
     * @param {number} index - The index of the step to show.
     */
    const showStep = async (index) => {
        if (resizeObserver) resizeObserver.disconnect();
        if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true);

        if (index < 0 || index >= steps.length) return skip();
        currentStepIndex = index;
        const step = steps[index];

        if (step.preAction) await step.preAction();
        const targetElement = await waitForVisibleElement(step.element);

        if (!targetElement) {
            console.warn(`Tutorial element not found: ${step.element}. Skipping step.`);
            return next();
        }

        await smartScroll(targetElement);
        if (step.click) targetElement.classList.add('tutorial-click-effect');

        document.getElementById('tutorial-tooltip-title').textContent = step.title;
        document.getElementById('tutorial-tooltip-text').innerHTML = step.content;
        document.getElementById('tutorial-prev-btn').style.display = index === 0 ? 'none' : 'inline-block';
        document.getElementById('tutorial-next-btn').textContent = index === steps.length - 1 ? 'Finalizar' : 'Siguiente';
        document.getElementById('tutorial-tooltip-progress').textContent = `Paso ${index + 1} de ${steps.length}`;

        updateHighlight(targetElement, step);
        resizeObserver = new ResizeObserver(() => updateHighlight(targetElement, step));
        resizeObserver.observe(targetElement);
        scrollHandler = () => updateHighlight(targetElement, step);
        window.addEventListener('scroll', scrollHandler, true);
    };

    /**
     * Intelligently scrolls an element into view only if it's not already visible.
     * @param {Element} element - The DOM element to scroll to.
     * @returns {Promise<void>}
     */
    const smartScroll = (element) => {
        return new Promise(resolve => {
            const rect = element.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!isVisible) {
                element.scrollIntoView({ behavior: 'instant', block: 'nearest' });
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            } else {
                resolve();
            }
        });
    };

    /**
     * Positions the tooltip relative to the target element, with smart flipping.
     * @param {DOMRect} targetRect - The bounding rect of the highlighted element.
     * @param {string} [position='bottom'] - The desired position.
     */
    const positionTooltip = (targetRect, position = 'bottom') => {
        const tooltipRect = dom.tooltip.getBoundingClientRect();
        const spacing = 10;
        let top, left;
        let finalPosition = position;

        if (position === 'right' && (targetRect.right + spacing + tooltipRect.width > window.innerWidth)) finalPosition = 'left';
        if (position === 'left' && (targetRect.left - spacing - tooltipRect.width < 0)) finalPosition = 'right';
        if (position === 'top' && (targetRect.top - spacing - tooltipRect.height < 0)) finalPosition = 'bottom';
        if (position === 'bottom' && (targetRect.bottom + spacing + tooltipRect.height > window.innerHeight)) finalPosition = 'top';

        switch (finalPosition) {
            case 'top': top = targetRect.top - tooltipRect.height - spacing; left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2); break;
            case 'right': top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2); left = targetRect.right + spacing; break;
            case 'left': top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2); left = targetRect.left - tooltipRect.width - spacing; break;
            default: top = targetRect.bottom + spacing; left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2); break;
        }

        left = Math.max(spacing, Math.min(left, window.innerWidth - tooltipRect.width - spacing));
        top = Math.max(spacing, Math.min(top, window.innerHeight - tooltipRect.height - spacing));

        dom.tooltip.style.top = `${top}px`;
        dom.tooltip.style.left = `${left}px`;
    };

    /**
     * Starts the tutorial.
     */
    const start = () => {
        if (dom.overlay) return;
        const menu = document.querySelector('[data-tutorial-id="eco-ecr-menu"]');
        if (menu) menu.classList.remove('open');
        steps = TUTORIAL_STEPS;
        createTutorialUI();
        dom.overlay.style.display = 'block';
        showStep(0);
    };

    /**
     * Moves to the next step in the tutorial.
     */
    const next = async () => {
        const step = steps[currentStepIndex];
        if (step && step.postAction) await step.postAction();
        await showStep(currentStepIndex + 1);
    };

    /**
     * Moves to the previous step in the tutorial.
     */
    const previous = async () => {
        await showStep(currentStepIndex - 1);
    };

    /**
     * Skips and closes the tutorial, cleaning up all elements and listeners.
     */
    const skip = () => {
        if (resizeObserver) resizeObserver.disconnect();
        if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true);
        if (dom.overlay) dom.overlay.remove();
        dom.overlay = dom.tooltip = dom.highlight = null;
        if (app && typeof app.onTutorialEnd === 'function') app.onTutorialEnd();
    };

    return { start, skip };
};

export default tutorial;

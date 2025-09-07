export const COLLECTIONS = {
    PRODUCTOS: 'productos',
    SEMITERMINADOS: 'semiterminados',
    INSUMOS: 'insumos',
    CLIENTES: 'clientes',
    SECTORES: 'sectores',
    PROCESOS: 'procesos',
    PROVEEDORES: 'proveedores',
    UNIDADES: 'unidades',
    USUARIOS: 'usuarios',
    TAREAS: 'tareas',
    PROYECTOS: 'proyectos',
    ROLES: 'roles',
    ECO_FORMS: 'eco_forms',
    ECR_FORMS: 'ecr_forms',
    COVER_MASTER: 'cover_master',
    REUNIONES_ECR: 'reuniones_ecr',
    NOTIFICATIONS: 'notifications'
};

export function getUniqueKeyForCollection(collectionName) {
    switch (collectionName) {
        case COLLECTIONS.PRODUCTOS:
        case COLLECTIONS.SEMITERMINADOS:
        case COLLECTIONS.INSUMOS:
            return 'codigo_pieza';
        case COLLECTIONS.PROYECTOS:
            return 'codigo';
        default:
            return 'id';
    }
}

/**
 * Creates an HTML string for a help tooltip icon.
 * @param {string} message - The help text to display in the tooltip.
 * @returns {string} - The HTML string for the tooltip component.
 */
export function createHelpTooltip(message) {
    const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;
    return `
        <div class="help-tooltip-container" tabindex="0" role="tooltip" aria-describedby="${tooltipId}">
            <i data-lucide="help-circle" class="help-icon"></i>
            <div class="help-tooltip-content" id="${tooltipId}">
                ${message}
            </div>
        </div>
    `;
}

/**
 * Determines if the PPAP confirmation checkbox should be required and validated for an ECO.
 * The condition is that PPAP is required by the client AND the client has formally approved it.
 * @param {object} ecrData - The data object from the associated ECR document.
 * @returns {boolean} - True if PPAP confirmation is required, false otherwise.
 */
export function shouldRequirePpapConfirmation(ecrData) {
    if (!ecrData) {
        return false;
    }
    // The logic is that the PPAP confirmation is only relevant if the ECR
    // both requires a PPAP and the client has given their final approval.
    return !!ecrData.cliente_requiere_ppap && ecrData.cliente_aprobacion_estado === 'aprobado';
}

/**
 * Validates a single form field based on its configuration.
 * @param {object} fieldConfig - The configuration object for the field from viewConfig.
 * @param {HTMLInputElement} inputElement - The DOM element for the input.
 * @returns {boolean} - True if the field is valid, false otherwise.
 */
export function validateField(fieldConfig, inputElement) {
    const errorElement = document.getElementById(`error-${fieldConfig.key}`);
    let isValid = true;
    let errorMessage = '';

    const value = inputElement.value.trim();

    // Check for required fields
    if (fieldConfig.required && !value) {
        isValid = false;
        errorMessage = 'Este campo es obligatorio.';
    }
    // Check for number types, but only if a value is present
    else if (fieldConfig.type === 'number' && value && isNaN(Number(value))) {
        isValid = false;
        errorMessage = 'Debe ingresar un valor numérico.';
    }

    if (errorElement) {
        errorElement.textContent = errorMessage;
    }
    inputElement.classList.toggle('border-red-500', !isValid);
    inputElement.classList.toggle('border-gray-300', isValid);
    return isValid;
}

/**
 * Saves ECR form data to local storage.
 * @param {HTMLElement} formContainer - The form element.
 * @param {string} storageKey - The key for local storage.
 */
export function saveEcrFormToLocalStorage(formContainer, storageKey) {
    if (!formContainer) return;
    const formData = new FormData(formContainer);
    const data = Object.fromEntries(formData.entries());
    // This is the fixed implementation.
    formContainer.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        data[cb.name] = cb.checked;
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
}

/**
 * Loads ECR form data from local storage and populates the form.
 * @param {HTMLElement} formContainer - The form element.
 * @param {string} storageKey - The key for local storage.
 * @param {Function} populateFormFn - The function to populate the form with data.
 */
export function loadEcrFormFromLocalStorage(formContainer, storageKey, populateFormFn) {
    const savedData = localStorage.getItem(storageKey);
    if (!savedData) return;
    const data = JSON.parse(savedData);
    populateFormFn(formContainer, data);
}

/**
 * Recursively traverses a product structure and returns a flat array of unique component reference IDs.
 * @param {Array} nodes - The array of nodes (the 'estructura' field) to process.
 * @returns {Array<string>} - A flat array of unique refIds.
 */
export function flattenEstructura(nodes) {
    const idSet = new Set();

    function traverse(nodeArray) {
        if (!nodeArray) return;
        for (const node of nodeArray) {
            // Add the component's own refId (if it's not the main product)
            if (node.tipo !== 'producto') {
                idSet.add(node.refId);
            }
            // Recurse into children
            if (node.children) {
                traverse(node.children);
            }
        }
    }

    traverse(nodes);
    return Array.from(idSet);
}

/**
 * Transforms flattened BOM data into a format suitable for jspdf-autotable.
 * @param {Array<Object>} flattenedData - The array of data from getFlattenedData.
 * @param {Object} collectionsById - The map of collections for resolving IDs.
 * @returns {{head: Array<Array<string>>, body: Array<Array<string>>}} - The headers and rows for the table.
 */
export function prepareDataForPdfAutoTable(flattenedData, collectionsById) {
    const head = [['Nivel', 'Descripción', 'Código', 'Versión', 'Proceso', 'Cantidad', 'Unidad', 'Comentarios']];
    const body = flattenedData.map(rowData => {
        const { node, item, level, isLast, lineage } = rowData;

        // Create the indented description
        let prefix = lineage.map(parentIsNotLast => parentIsNotLast ? '│  ' : '   ').join('');
        if (level > 0) {
            prefix += isLast ? '└─ ' : '├─ ';
        }
        const descripcion = `${prefix}${item.descripcion || item.nombre || ''}`;

        // Get process description
        let proceso = 'N/A';
        if (item.proceso && collectionsById[COLLECTIONS.PROCESOS]) {
            const procesoData = collectionsById[COLLECTIONS.PROCESOS].get(item.proceso);
            proceso = procesoData ? procesoData.descripcion : item.proceso;
        }

        // Get unit description
        let unidad = '';
        if (node.tipo === 'insumo' && item.unidad_medida && collectionsById[COLLECTIONS.UNIDADES]) {
            const unidadData = collectionsById[COLLECTIONS.UNIDADES].get(item.unidad_medida);
            unidad = unidadData ? unidadData.id : item.unidad_medida;
        }

        const cantidad = node.tipo === 'producto' ? 1 : (node.quantity ?? 'N/A');

        return [
            level,
            descripcion,
            item.id || 'N/A',
            item.version || 'N/A',
            proceso,
            cantidad,
            unidad,
            node.comment || ''
        ];
    });

    return { head, body };
}

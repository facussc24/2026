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
    ECR_DRAFTS: 'ecr_drafts',
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
 * Transforms flattened Product Structure data into a format suitable for jspdf-autotable.
 * This version returns an array of objects to preserve metadata for custom drawing.
 * @param {Array<Object>} flattenedData - The array of data from getFlattenedData.
 * @param {Object} collectionsById - The map of collections for resolving IDs.
 * @returns {{body: Array<Object>}} - An object containing the body as an array of processed objects.
 */
export function prepareDataForPdfAutoTable(flattenedData, collectionsById, product) {
    const head = [[
        'Descripción',
        'Nivel',
        'Código',
        'Cantidad',
        'Comentarios'
    ]];

    const body = flattenedData.map(rowData => {
        const { node, item, level, isLast, lineage } = rowData;
        const NA = 'N/A';

        // Helper to safely convert values to strings
        const toStr = (value) => String(value ?? NA);

        // --- Tree Prefix Generation for PDF ---
        let prefix = lineage.map(parentIsNotLast => parentIsNotLast ? '│  ' : '   ').join('');
        if (level > 0) {
            prefix += isLast ? '└─ ' : '├─ ';
        }

        const descripcion = prefix + toStr(item.descripcion || item.nombre);
        const nivel = toStr(level);
        const codigo_pieza = toStr(item.id);
        const cantidad = node.tipo !== 'producto' ? toStr(node.quantity ?? 1) : '1';
        const comentarios = toStr(node.comment || '');
        const version = toStr(item.version);

        const procesoData = collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
        const proceso = procesoData ? procesoData.descripcion : toStr(item.proceso);

        const unidadData = collectionsById[COLLECTIONS.UNIDADES]?.get(item.unidad_medida);
        const unidad = unidadData ? unidadData.id : toStr(item.unidad_medida);

        return {
            descripcion,
            nivel,
            codigo: codigo_pieza,
            cantidad,
            comentarios,
            version,
            proceso,
            unidad,
            // Include raw data for potential custom rendering in PDF
            _raw: { node, item }
        };
    });

    // The test expects a deep copy, and this is a safe way to do it for JSON-compatible objects.
    const rawData = JSON.parse(JSON.stringify(flattenedData));

    return { head, body, rawData };
}

export function generateProductStructureReportHTML(product, flattenedData, logoBase64, collectionsById) {
    const client = collectionsById[COLLECTIONS.CLIENTES].get(product.clienteId);
    const createdAt = product.createdAt ? new Date(product.createdAt.seconds * 1000).toLocaleDateString('es-AR') : 'N/A';
    const proyecto = collectionsById[COLLECTIONS.PROYECTOS]?.get(product.proyectoId);

    const tableRows = flattenedData.map(rowData => {
        const { node, item, level, isLast, lineage } = rowData;
        // This is the corrected prefix generation logic.
        let prefix = lineage.map(parentIsNotLast => parentIsNotLast ? '│&nbsp;&nbsp;' : '&nbsp;&nbsp;&nbsp;').join('');
        if (level > 0) {
            prefix += isLast ? '└─ ' : '├─ ';
        }
        return `
            <tr style="background-color: ${level % 2 === 0 ? '#f7fafc' : '#fff'};">
                <td style="border: 1px solid #eee; padding: 4px; font-family: monospace; white-space: pre;">${prefix}${item.descripcion}</td>
                <td style="border: 1px solid #eee; padding: 4px; text-align: center;">${level}</td>
                <td style="border: 1px solid #eee; padding: 4px; text-align: center;">${item.id}</td>
                <td style="border: 1px solid #eee; padding: 4px; text-align: center;">${node.tipo !== 'producto' ? (node.quantity ?? 1) : ''}</td>
                <td style="border: 1px solid #eee; padding: 4px;">${node.comment || ''}</td>
            </tr>
        `;
    }).join('');

    return `
        <div id="pdf-content" style="padding: 15mm; font-family: sans-serif; color: #333; width: 210mm; min-height: 296mm;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
                ${logoBase64 ? `<img src="${logoBase64}" style="height: 40px;">` : '<div></div>'}
                <div style="text-align: right;">
                    <h1 style="font-size: 22px; font-weight: bold; margin: 0; color: #1e40af;">Composición de Piezas</h1>
                    <p style="font-size: 14px; margin: 0;">${product.descripcion}</p>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px 15px; font-size: 9px; margin-bottom: 15px;">
                <div><strong>Nº de Pieza:</strong> ${product.id}</div>
                <div><strong>Fecha Creación:</strong> ${createdAt}</div>
                <div><strong>Versión:</strong> ${product.version}</div>
                <div><strong>Fecha Revisión:</strong> ${product.fechaRevision || 'N/A'}</div>
                <div><strong>Proyecto:</strong> ${proyecto?.nombre || 'N/A'}</div>
                <div><strong>Realizó:</strong> ${product.lastUpdatedBy || 'N/A'}</div>
                <div><strong>Cliente:</strong> ${client?.descripcion || 'N/A'}</div>
                <div><strong>Aprobó:</strong> ${product.aprobadoPor || 'N/A'}</div>
            </div>

            <!-- Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 8px;">
                <thead>
                    <tr style="background-color: #4A5568; color: white;">
                        <th style="border: 1px solid #ccc; padding: 5px; text-align: left; width: 50%;">Descripción</th>
                        <th style="border: 1px solid #ccc; padding: 5px; text-align: center;">Nivel</th>
                        <th style="border: 1px solid #ccc; padding: 5px; text-align: center;">Código</th>
                        <th style="border: 1px solid #ccc; padding: 5px; text-align: center;">Cantidad</th>
                        <th style="border: 1px solid #ccc; padding: 5px; text-align: left;">Comentarios</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}

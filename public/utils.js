/**
 * @file Utility functions and constants shared across the frontend application.
 */

/**
 * An enumeration of all Firestore collection names used in the application.
 * Using this constant object helps prevent typos and ensures consistency.
 * @const {object}
 * @property {string} PRODUCTOS - Collection for final products.
 * @property {string} SEMITERMINADOS - Collection for semi-finished goods.
 * @property {string} INSUMOS - Collection for raw materials/supplies.
 * @property {string} CLIENTES - Collection for clients/customers.
 * @property {string} SECTORES - Collection for company departments/sectors.
 * @property {string} PROCESOS - Collection for manufacturing processes.
 * @property {string} PROVEEDORES - Collection for suppliers.
 * @property {string} UNIDADES - Collection for units of measurement.
 * @property {string} USUARIOS - Collection for application users.
 * @property {string} TAREAS - Collection for tasks or action items.
 * @property {string} PROYECTOS - Collection for projects.
 * @property {string} ROLES - Collection for user roles and permissions.
 * @property {string} ECO_FORMS - Collection for Engineering Change Order forms.
 * @property {string} ECR_FORMS - Collection for Engineering Change Request forms.
 * @property {string} COVER_MASTER - Collection for master cover data.
 * @property {string} REUNIONES_ECR - Collection for ECR-related meetings.
 * @property {string} NOTIFICATIONS - Collection for user notifications.
 */
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

/**
 * Gets the primary unique identifier key for a given collection.
 * Some collections use a business-specific key (e.g., 'codigo_pieza') instead of the default 'id'.
 * This function helps retrieve the correct key for data operations.
 * @param {string} collectionName - The name of the collection from the `COLLECTIONS` enum.
 * @returns {string} The unique key field name for that collection. Defaults to 'id'.
 */
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
 * The tooltip is displayed on hover or focus and is accessible.
 * @param {string} message - The help text to display in the tooltip.
 * @returns {string} The complete HTML string for the tooltip component.
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
 * Determines if the PPAP (Production Part Approval Process) confirmation checkbox
 * should be required and validated for an Engineering Change Order (ECO).
 * The condition is met only if PPAP is required by the client AND the client has formally approved the change.
 * @param {object} ecrData - The data object from the associated ECR document.
 * @returns {boolean} Returns `true` if PPAP confirmation is required, otherwise `false`.
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
 * It checks for 'required' and 'number' type constraints.
 * It also provides visual feedback by adding/removing CSS classes and displaying an error message.
 * @param {object} fieldConfig - The configuration object for the field from `viewConfig`.
 * @param {string} fieldConfig.key - The unique key for the field (used for error element ID).
 * @param {boolean} [fieldConfig.required] - Whether the field is mandatory.
 * @param {string} [fieldConfig.type] - The input type (e.g., 'number').
 * @param {HTMLInputElement} inputElement - The DOM element for the input field to be validated.
 * @returns {boolean} Returns `true` if the field is valid, otherwise `false`.
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
 * Saves the current state of an ECR form to the browser's local storage.
 * This prevents data loss on accidental page reloads.
 * It correctly handles all input types, including checkboxes.
 * @param {HTMLElement} formContainer - The form element containing the inputs.
 * @param {string} storageKey - The unique key under which to save the data in local storage.
 */
export function saveEcrFormToLocalStorage(formContainer, storageKey) {
    if (!formContainer) return;
    const formData = new FormData(formContainer);
    const data = Object.fromEntries(formData.entries());
    // This is the fixed implementation to correctly save checkbox states.
    formContainer.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(cb => {
        data[cb.name] = cb.checked;
    });
    localStorage.setItem(storageKey, JSON.stringify(data));
}

/**
 * Loads ECR form data from local storage and uses a provided function to populate the form fields.
 * @param {HTMLElement} formContainer - The form element to be populated.
 * @param {string} storageKey - The key from which to retrieve the data in local storage.
 * @param {Function} populateFormFn - The function to call to populate the form. It will be passed the form container and the loaded data.
 */
export function loadEcrFormFromLocalStorage(formContainer, storageKey, populateFormFn) {
    const savedData = localStorage.getItem(storageKey);
    if (!savedData) return;
    const data = JSON.parse(savedData);
    populateFormFn(formContainer, data);
}

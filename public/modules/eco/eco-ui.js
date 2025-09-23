/**
 * @file Contains all UI rendering logic for the ECO module.
 */
import { COLLECTIONS } from '../../utils.js';

async function openEcrSearchModalForEcoForm(deps) {
    const { db, firestore, dom, lucide, appState, showToast, ensureCollectionsAreLoaded } = deps;
    const { collection, query, where, getDocs } = firestore;
    // Ensure the ECR collection is loaded before proceeding.
    try {
        await ensureCollectionsAreLoaded(db, firestore, appState, [COLLECTIONS.ECR_FORMS]);
    } catch (error) {
        showToast('Error al cargar la lista de ECRs. Intente de nuevo.', 'error');
        return;
    }

    const modalId = `ecr-search-for-eco-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl m-4 modal-content max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Seleccionar ECR Aprobado</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-4 border-b">
                    <input type="text" id="ecr-search-input-modal" placeholder="Buscar por N°, producto o cliente..." class="w-full p-2 border rounded-md">
                </div>
                <div id="ecr-list-container" class="p-6 overflow-y-auto">
                    <!-- ECRs will be rendered here -->
                </div>
            </div>
        </div>
    `;

    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);

    const approvedEcrs = appState.collections[COLLECTIONS.ECR_FORMS].filter(ecr => ecr.status === 'approved');

    const renderList = (searchTerm = '') => {
        const container = modalElement.querySelector('#ecr-list-container');
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredEcrs = approvedEcrs.filter(ecr =>
            ecr.id.toLowerCase().includes(lowerCaseSearchTerm) ||
            (ecr.denominacion_producto && ecr.denominacion_producto.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (ecr.cliente && ecr.cliente.toLowerCase().includes(lowerCaseSearchTerm))
        );

        if (filteredEcrs.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-500 py-8">No se encontraron ECRs aprobados.</p>';
            return;
        }

        container.innerHTML = filteredEcrs.map(ecr => `
            <button data-ecr-id="${ecr.id}" class="w-full text-left p-3 mb-2 bg-slate-50 hover:bg-blue-100 rounded-md border transition">
                <div class="flex justify-between items-center">
                    <p class="font-bold text-blue-800">${ecr.id}</p>
                    <p class="text-xs text-slate-500">Cliente: ${ecr.cliente || 'N/A'}</p>
                </div>
                <p class="text-sm text-slate-700">${ecr.denominacion_producto || 'Sin descripción'}</p>
            </button>
        `).join('');
    };

    modalElement.querySelector('#ecr-search-input-modal').addEventListener('input', e => renderList(e.target.value));

    modalElement.querySelector('#ecr-list-container').addEventListener('click', e => {
        const button = e.target.closest('button[data-ecr-id]');
        if (button) {
            const ecrId = button.dataset.ecrId;
            const ecrData = approvedEcrs.find(ecr => ecr.id === ecrId);
            if (ecrData) {
                const ecrNoInput = document.getElementById('ecr_no');
                const ecrNoDisplay = document.getElementById('ecr_no_display');

                if (ecrNoInput && ecrNoDisplay) {
                    ecrNoInput.value = ecrData.id;
                    ecrNoDisplay.value = `${ecrData.denominacion_producto} (${ecrData.id})`;

                    const formElement = document.getElementById('eco-form');
                    const fieldsToPrepopulate = {
                        'name_eng_producto': ecrData.equipo_c1_2,
                        'comments_eng_producto': `Basado en la situación propuesta en el ECR ${ecrData.id}:\n${ecrData.situacion_propuesta || ''}`
                    };

                    for (const fieldName in fieldsToPrepopulate) {
                        const element = formElement.querySelector(`[name="${fieldName}"]`);
                        if (element) {
                            element.value = fieldsToPrepopulate[fieldName];
                        }
                    }
                    if (ecrData.cliente_requiere_ppap && ecrData.cliente_aprobacion_estado === 'aprobado') {
                        const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                        if (ppapContainer) {
                            ppapContainer.classList.remove('hidden');
                        }
                    }
                }
            }
            modalElement.remove();
        }
    });

    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    renderList();
}


/**
 * Renders the main list view for all ECOs.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, query, orderBy, onSnapshot }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {function} deps.switchView - Function to switch views.
 * @returns {Promise<Function>} A promise that resolves with a cleanup function to unsubscribe from the listener.
 */
export function renderEcoListView(deps) {
    const { db, firestore, dom, lucide, switchView } = deps;
    const { collection, query, orderBy, onSnapshot } = firestore;

    return new Promise(resolve => {
        dom.headerActions.style.display = 'none';

        const viewHTML = `
            <div class="animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-slate-800">Planilla General de ECO</h2>
                        <p class="text-sm text-slate-500">Aquí puede ver y gestionar sus ECOs. Los nuevos ECOs se generan desde la lista de ECRs aprobados.</p>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-gray-600">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" class="px-6 py-3">ECR N°</th>
                                    <th scope="col" class="px-6 py-3">Estado</th>
                                    <th scope="col" class="px-6 py-3">Última Modificación</th>
                                    <th scope="col" class="px-6 py-3">Modificado Por</th>
                                    <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="eco-table-body">
                                <tr>
                                    <td colspan="5" class="text-center py-16 text-gray-500">
                                        <div class="flex flex-col items-center gap-3">
                                            <i data-lucide="loader" class="w-12 h-12 text-gray-300 animate-spin"></i>
                                            <h4 class="font-semibold">Cargando ECO...</h4>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        const ecoFormsRef = collection(db, 'eco_forms');
        const q = query(ecoFormsRef, orderBy('lastModified', 'desc'));

        let isFirstRender = true;
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ecoTableBody = document.getElementById('eco-table-body');
            if (!ecoTableBody) return;

            if (querySnapshot.empty) {
                ecoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No se encontraron ECOs</h3><p class="text-sm">Puede crear uno nuevo con el botón de arriba.</p></div></td></tr>`;
                 lucide.createIcons();
            } else {
                let tableRowsHTML = '';
                querySnapshot.forEach(doc => {
                    const eco = doc.data();
                    const lastModified = eco.lastModified?.toDate ? eco.lastModified.toDate().toLocaleString('es-AR') : 'N/A';
                    const statusColors = { 'in-progress': 'bg-yellow-100 text-yellow-800', 'approved': 'bg-green-100 text-green-800', 'rejected': 'bg-red-100 text-red-800' };
                    const statusText = { 'in-progress': 'En Progreso', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
                    tableRowsHTML += `
                        <tr class="bg-white border-b hover:bg-gray-50">
                            <td class="px-6 py-4 font-medium text-gray-900">${eco.id || 'N/A'}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColors[eco.status] || 'bg-gray-100 text-gray-800'}">${statusText[eco.status] || eco.status}</span></td>
                            <td class="px-6 py-4">${lastModified}</td>
                            <td class="px-6 py-4">${eco.modifiedBy || 'N/A'}</td>
                            <td class="px-6 py-4 text-right">
                                <button data-action="view-eco" data-id="${eco.id}" class="text-gray-500 hover:text-blue-600 p-1" title="Ver/Editar"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="view-eco-history" data-id="${eco.id}" class="text-gray-500 hover:text-purple-600 p-1" title="Ver Historial"><i data-lucide="history" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="export-eco-pdf" data-id="${eco.id}" class="text-gray-500 hover:text-red-600 p-1" title="Exportar a PDF"><i data-lucide="file-text" class="h-5 w-5 pointer-events-none"></i></button>
                                ${eco.status === 'in-progress' ? `<button data-action="approve-eco" data-id="${eco.id}" class="text-gray-500 hover:text-green-600 p-1" title="Aprobar ECO"><i data-lucide="check-circle" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
                            </td>
                        </tr>`;
                });
                ecoTableBody.innerHTML = tableRowsHTML;
            }
            lucide.createIcons();
            if (isFirstRender) {
                isFirstRender = false;
                resolve(unsubscribe);
            }
        }, (error) => {
            console.error("Error fetching ECOs: ", error);
            const ecoTableBody = document.getElementById('eco-table-body');
            if (ecoTableBody) {
                ecoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-16 w-16"></i><h3 class="mt-4 text-lg font-semibold">Error al cargar ECO</h3><p class="text-sm">${error.message}</p></div></td></tr>`;
                lucide.createIcons();
            }
            if (isFirstRender) {
                isFirstRender = false;
                resolve(() => {}); // Resolve with an empty cleanup function on error
            }
        });
    });
}

/**
 * Renders the ECO form for creating or editing an Engineering Change Order.
 * @param {object} params - Parameters for the form, e.g., { ecoId: '...' } or { ecrData: {...} }.
 * @param {object} deps - Dependencies object.
 */
export async function renderEcoFormView(params = null, deps) {
    const { db, firestore, dom, lucide, appState, showToast, switchView, shouldRequirePpapConfirmation, sendNotification, showConfirmationModal, ensureCollectionsAreLoaded } = deps;
    const { doc, getDoc, collection, writeBatch, updateDoc } = firestore;

    const ecoId = params?.ecoId;
    const ecrDataFromParam = params?.ecrData;
    const isEditing = !!ecoId;
    // Use a specific key when creating from an ECR to avoid conflicts with a generic new form
    const ECO_FORM_STORAGE_KEY = isEditing ? `inProgressEcoForm_${ecoId}` : (ecrDataFromParam ? `inProgressEcoForm_from_ecr_${ecrDataFromParam.id}` : 'inProgressEcoForm_new');

    const populateEcoForm = (form, data) => {
        if (!data || !form) return;

        for (const key in data) {
            if (key === 'checklists' && typeof data.checklists === 'object') {
                for (const section in data.checklists) {
                    data.checklists[section].forEach((item, index) => {
                        const siCheckbox = form.querySelector(`input[name="check_${section}_${index}_si"]`);
                        if (siCheckbox) siCheckbox.checked = !!item.si;
                        const naCheckbox = form.querySelector(`input[name="check_${section}_${index}_na"]`);
                        if (naCheckbox) naCheckbox.checked = !!item.na;
                    });
                }
            } else if (key === 'comments' && typeof data.comments === 'object') {
                for (const section in data.comments) {
                    const textarea = form.querySelector(`[name="comments_${section}"]`);
                    if (textarea) textarea.value = data.comments[section];
                }
            } else if (key === 'signatures' && typeof data.signatures === 'object') {
                for (const sectionId in data.signatures) {
                    for (const field in data.signatures[sectionId]) {
                        const inputName = `${field}_${sectionId}`;
                        const inputElement = form.querySelector(`[name="${inputName}"]`);
                        if (inputElement) {
                            if (inputElement.type === 'radio') {
                                const radioToSelect = form.querySelector(`[name="${inputName}"][value="${data.signatures[sectionId][field]}"]`);
                                if (radioToSelect) radioToSelect.checked = true;
                            } else {
                                inputElement.value = data.signatures[sectionId][field];
                            }
                        }
                    }
                }
            } else {
                const element = form.querySelector(`[name="${key}"]`);
                if (element) {
                    element.value = data[key];
                }
            }
        }
    };

    // Helper to save form data to Local Storage
    const saveEcoFormToLocalStorage = () => {
        const form = dom.viewContent.querySelector('#eco-form');
        if (!form) return;

        const data = {};
        // Iterate over all form elements to build the data object manually.
        // This is more robust than using `new FormData()` because it allows us
        // to explicitly ignore disabled fields, which is the core of the fix.
        for (const element of form.elements) {
            // Skip disabled elements, elements without a name, or buttons.
            if (element.disabled || !element.name || element.tagName === 'BUTTON') {
                continue;
            }

            switch (element.type) {
                case 'checkbox':
                    // For checkboxes, we always store the boolean `checked` state.
                    data[element.name] = element.checked;
                    break;
                case 'radio':
                    // For radio buttons, only save the value of the selected one.
                    if (element.checked) {
                        data[element.name] = element.value;
                    }
                    break;
                case 'select-multiple':
                    // For multi-select, gather all selected options.
                    data[element.name] = Array.from(element.options)
                        .filter(option => option.selected)
                        .map(option => option.value);
                    break;
                default:
                    // For all other input types (text, date, select-one, etc.).
                    data[element.name] = element.value;
                    break;
            }
        }

        localStorage.setItem(ECO_FORM_STORAGE_KEY, JSON.stringify(data));
    };

    // Helper to load form data from Local Storage
    const loadEcoFormFromLocalStorage = () => {
        const savedData = localStorage.getItem(ECO_FORM_STORAGE_KEY);
        if (!savedData) return;

        const data = JSON.parse(savedData);
        const form = dom.viewContent.querySelector('#eco-form');
        if (!form) return;

        for (const key in data) {
            const element = form.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = data[key];
                } else if (element.type === 'radio') {
                    const radioToSelect = form.querySelector(`[name="${key}"][value="${data[key]}"]`);
                    if (radioToSelect) radioToSelect.checked = true;
                }
                else {
                    element.value = data[key];
                }
            }
        }

        // --- Populate Image Previews ---
        const situacionExistenteImg = document.getElementById('situacion-existente-image-preview');
        const situacionPropuestaImg = document.getElementById('situacion-propuesta-image-preview');
        const situacionExistenteDeleteBtn = document.getElementById('situacion-existente-image-delete');
        const situacionPropuestaDeleteBtn = document.getElementById('situacion-propuesta-image-delete');

        if (data.situacion_existente_image_url && situacionExistenteImg) {
            situacionExistenteImg.src = data.situacion_existente_image_url;
            situacionExistenteImg.classList.remove('hidden');
            if (situacionExistenteDeleteBtn) situacionExistenteDeleteBtn.classList.remove('hidden');
        }
        if (data.situacion_propuesta_image_url && situacionPropuestaImg) {
            situacionPropuestaImg.src = data.situacion_propuesta_image_url;
            situacionPropuestaImg.classList.remove('hidden');
            if (situacionPropuestaDeleteBtn) situacionPropuestaDeleteBtn.classList.remove('hidden');
        }
    };


    try {
        // --- DYNAMICALLY CREATE THE FORM STRUCTURE ---
        dom.viewContent.innerHTML = ''; // Clear previous content

        const formElement = document.createElement('form');
        formElement.id = 'eco-form';
        formElement.className = 'max-w-7xl mx-auto bg-white shadow-lg rounded-lg p-8';
        formElement.innerHTML = `
            <header class="flex justify-between items-center border-b-2 pb-4 mb-6">
                <div class="flex-shrink-0">
                    <img src="/barack_logo.png" alt="Logo" class="h-12">
                </div>
                <div class="ml-auto">
                    <div class="form-field">
                        <label for="ecr_no_display" class="text-lg font-semibold">ECR Asociado:</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input type="text" id="ecr_no_display" class="border-2 border-gray-300 rounded-md p-2 w-64 bg-gray-100" readonly placeholder="Seleccionar ECR...">
                            <input type="hidden" name="ecr_no" id="ecr_no">
                            <button type="button" data-action="open-ecr-search-for-eco" class="bg-blue-500 text-white p-2.5 rounded-md hover:bg-blue-600"><i data-lucide="search" class="h-5 w-5 pointer-events-none"></i></button>
                        </div>
                    </div>
                </div>
            </header>
            <main id="dynamic-form-sections"></main>
            <div id="ppap-confirmation-container" data-tutorial-id="ppap-container" class="hidden mt-6 p-4 border-2 border-yellow-400 bg-yellow-50 rounded-lg">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="ppap_completed_confirmation" class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300">
                    <div class="flex-grow">
                        <p class="font-bold text-yellow-800">Confirmación de PPAP Requerida</p>
                        <p class="text-sm text-yellow-700">El ECR asociado indica que se requiere un PPAP. Marque esta casilla para confirmar que el PPAP ha sido completado y aprobado por el cliente antes de cerrar este ECO.</p>
                    </div>
                </label>
            </div>

            <!-- Action Plan Section -->
            <section id="action-plan-section" class="mt-8">
                <div class="ecr-checklist-bar">PLAN DE ACCIÓN</div>
                <div class="p-4 border border-t-0 rounded-b-lg">
                    <div id="action-plan-list" class="space-y-2">
                        <!-- Action items will be rendered here -->
                    </div>
                    <div id="add-action-item-form-wrapper" data-tutorial-id="add-action-item-form-container">
                        <div id="add-action-item-form" class="mt-4 flex items-end gap-3 p-3 bg-slate-50 rounded-lg border">
                            <div class="flex-grow">
                                <label for="new-action-description" class="text-xs font-bold text-slate-600">Nueva Acción</label>
                                <input type="text" id="new-action-description" placeholder="Descripción de la tarea..." class="w-full mt-1 p-2 border rounded-md">
                            </div>
                            <div class="w-48">
                                <label for="new-action-assignee" class="text-xs font-bold text-slate-600">Responsable</label>
                                <select id="new-action-assignee" class="w-full mt-1 p-2 border rounded-md"></select>
                            </div>
                            <div class="w-40">
                                <label for="new-action-duedate" class="text-xs font-bold text-slate-600">Fecha Límite</label>
                                <input type="date" id="new-action-duedate" class="w-full mt-1 p-2 border rounded-md">
                            </div>
                            <button type="button" id="add-action-item-btn" class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 font-semibold h-10">Agregar</button>
                        </div>
                    </div>
                </div>
            </section>

            <div id="action-buttons-container" class="mt-8 flex justify-end space-x-4">
                <button type="button" id="eco-save-button" class="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600">Guardar Progreso</button>
                <button type="button" id="eco-clear-button" class="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600">Limpiar Formulario</button>
                <button type="button" id="eco-approve-button" class="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700">Aprobar y Guardar</button>
            </div>
        `;
        dom.viewContent.appendChild(formElement);

        // CSS is now loaded via index.html
        if (!document.getElementById('print-styles')) {
            const link = document.createElement('link');
            link.id = 'print-styles';
            link.rel = 'stylesheet';
            link.href = 'print.css';
            link.media = 'print';
            document.head.appendChild(link);
        }

        const formSectionsData = [
            {
                title: 'ENG. PRODUCTO', id: 'eng_producto', icon: 'drafting-compass',
                checklist: [ '¿Se requiere cambio en el plano?', '¿Se requiere cambio en la especificación?', '¿Se requiere un nuevo herramental?', '¿Se requiere un nuevo dispositivo?' ]
            },
            {
                title: 'CALIDAD', id: 'calidad', icon: 'award',
                checklist: [ '¿Se requiere un nuevo plan de control?', '¿Se requiere un nuevo estudio de capacidad?', '¿Se requiere un nuevo R&R?', '¿Se requiere un nuevo layout?' ]
            },
            {
                title: 'ENG. PROCESO', id: 'eng_proceso', icon: 'cpu',
                checklist: [ '¿Se requiere un nuevo diagrama de flujo?', '¿Se requiere un nuevo AMEF?', '¿Se requiere un nuevo estudio de tiempos?', '¿Se requiere una nueva instrucción de trabajo?' ]
            },
            {
                title: 'DOCUMENTACIÓN CALIDAD', id: 'doc_calidad', icon: 'folder-check',
                checklist: [ '¿Se actualizó el AMFE de Proceso?', '¿Se actualizó el Plan de Control?', '¿Se actualizaron las Hojas de Proceso?', '¿Se actualizó el Diagrama de Flujo?' ]
            },
            {
                title: 'COMPRAS', id: 'compras', icon: 'shopping-cart',
                checklist: [ '¿Se requiere un nuevo proveedor?', '¿Se requiere un nuevo acuerdo de precios?', '¿Se requiere un nuevo embalaje?', '¿Se requiere un nuevo transporte?' ]
            },
            {
                title: 'LOGISTICA', id: 'logistica', icon: 'truck',
                checklist: [ '¿Se requiere un nuevo layout de almacén?', '¿Se requiere un nuevo sistema de identificación?', '¿Se requiere un nuevo flujo de materiales?', '¿Se requiere un nuevo sistema de transporte interno?' ]
            },
            {
                title: 'IMPLEMENTACIÓN', id: 'implementacion', icon: 'rocket',
                checklist: [ '¿Plan de acción completado?', '¿Se requiere actualizar el stock?', '¿Se requiere notificar al cliente?', '¿Se requiere capacitar al personal?', '¿Se requiere validar el proceso?' ]
            },
            {
                title: 'APROBACIÓN FINAL', id: 'aprobacion_final', icon: 'flag',
                description: 'Aprobación final del ECO y cierre del proceso.',
                checklist: null
            }
        ];

        function buildSectionHTML(section) {
            const checklistItemsHTML = section.checklist
                ? section.checklist.map((item, index) => {
                    const tutorialId = (section.id === 'implementacion' && index === 0)
                        ? 'data-tutorial-id="action-plan-completion-checkbox"'
                        : '';
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-slate-100" ${tutorialId}>
                            <span class="text-sm">${item}</span>
                            <div class="flex items-center gap-6">
                                <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                    <input type="checkbox" name="check_${section.id}_${index}_si" class="h-5 w-5 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500">
                                    <span>SI</span>
                                </label>
                                <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                    <input type="checkbox" name="check_${section.id}_${index}_na" class="h-5 w-5 text-gray-400 rounded-md border-gray-300 focus:ring-gray-500">
                                    <span>N/A</span>
                                </label>
                            </div>
                        </div>
                    `;
                }).join('')
                : '';

            const mainContentHTML = section.checklist
                ? `
                <div class="flex-1 space-y-2 pr-6 border-r border-slate-200">
                    ${checklistItemsHTML}
                </div>
                <div class="flex-1">
                    <label for="comments_${section.id}" class="block font-bold text-slate-700 mb-2">Comentarios:</label>
                    <textarea id="comments_${section.id}" name="comments_${section.id}" rows="8" class="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"></textarea>
                </div>`
                : `<div class="p-4 w-full text-center text-slate-500 italic">${section.description}</div>`;

            const statusFieldHTML = section.checklist
                ? `
                <div>
                    <label class="text-sm font-medium text-slate-600">Estado</label>
                    <div class="flex items-center gap-4 mt-1">
                        <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="ok" class="h-4 w-4 text-green-600 focus:ring-green-500"> <span class="font-semibold text-green-700">OK</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="nok" class="h-4 w-4 text-red-600 focus:ring-red-500"> <span class="font-semibold text-red-700">NOK</span></label>
                    </div>
                </div>`
                : '';

            return `
            <section class="border border-slate-200 rounded-xl mb-6 bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:border-blue-300">
                <header class="bg-slate-50 px-5 py-3 font-bold text-lg text-slate-800 flex items-center gap-3 border-b border-slate-200 rounded-t-xl">
                    <i data-lucide="${section.icon || 'help-circle'}" class="w-6 h-6 text-blue-600"></i>
                    <span>${section.title}</span>
                </header>
                <div class="p-5">
                    <div class="flex gap-6">${mainContentHTML}</div>
                </div>
                <footer class="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm rounded-b-xl">
                    <div>
                        <label for="date_review_${section.id}" class="block text-xs font-medium text-slate-500">Fecha de Revisión</label>
                        <input type="date" id="date_review_${section.id}" name="date_review_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    ${statusFieldHTML}
                    <div class="flex-grow"></div>
                    <div>
                        <label for="name_${section.id}" class="block text-xs font-medium text-slate-500">Nombre del Aprobador</label>
                        <input type="text" id="name_${section.id}" name="name_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm w-48">
                    </div>
                    <div>
                        <label for="visto_${section.id}" class="block text-xs font-medium text-slate-500">Firma</label>
                        <input type="text" id="visto_${section.id}" name="visto_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm w-32">
                    </div>
                </footer>
            </section>`;
        }

        const container = formElement.querySelector('#dynamic-form-sections');
        if (container) {
            formSectionsData.forEach(section => {
                const sectionHTML = buildSectionHTML(section);
                container.insertAdjacentHTML('beforeend', sectionHTML);
            });

            // Add event listener for mutually exclusive checkboxes
            container.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox' && e.target.name.startsWith('check_')) {
                    const name = e.target.name;
                    const isChecked = e.target.checked;

                    if (!isChecked) return; // Only act when a box is checked

                    const parts = name.split('_');
                    const sectionId = parts[1];
                    const index = parts[2];
                    const type = parts[3];

                    let otherCheckbox;
                    if (type === 'si') {
                        otherCheckbox = container.querySelector(`input[name="check_${sectionId}_${index}_na"]`);
                    } else if (type === 'na') {
                        otherCheckbox = container.querySelector(`input[name="check_${sectionId}_${index}_si"]`);
                    }

                    if (otherCheckbox && otherCheckbox.checked) {
                        otherCheckbox.checked = false;
                    }
                }
            });
        }

        // --- Button Logic ---
        const saveButton = formElement.querySelector('#eco-save-button');
        const approveButton = formElement.querySelector('#eco-approve-button');
        const clearButton = formElement.querySelector('#eco-clear-button');
        const ecrInput = formElement.querySelector('#ecr_no');

        let actionPlan = [];

        const updateActionPlanCompletionStatus = () => {
            // The new checkbox is the first item (index 0) in the 'implementacion' section.
            const actionPlanCheckbox = document.querySelector('input[name="check_implementacion_0_si"]');
            if (!actionPlanCheckbox) return;

            // This checkbox should be controlled only by the action plan's status.
            actionPlanCheckbox.disabled = true;

            const allTasksCompleted = actionPlan.length > 0 && actionPlan.every(task => task.status === 'completed');
            actionPlanCheckbox.checked = allTasksCompleted;

            // Also disable the N/A checkbox for this item
            const naCheckbox = document.querySelector('input[name="check_implementacion_0_na"]');
            if(naCheckbox) naCheckbox.disabled = true;
        };

        const renderActionPlan = () => {
            const listEl = document.getElementById('action-plan-list');
            if (!listEl) return;
            if (actionPlan.length === 0) {
                listEl.innerHTML = '<p class="text-center text-sm text-slate-500 py-4">No hay acciones en el plan.</p>';
            } else {
                listEl.innerHTML = actionPlan.map((item, index) => `
                    <div class="action-item grid grid-cols-[1fr,120px,100px,50px] gap-3 items-center p-2 rounded-md ${item.status === 'completed' ? 'bg-green-50' : 'bg-white'} border">
                        <p class="font-medium text-slate-700">${item.description}</p>
                        <p class="text-sm text-slate-600">${item.assignee || 'N/A'}</p>
                        <p class="text-sm text-slate-500">${item.dueDate || 'N/A'}</p>
                        <div class="flex justify-center gap-2">
                             <input type="checkbox" data-action="toggle-action-status" data-index="${index}" class="h-4 w-4" ${item.status === 'completed' ? 'checked' : ''}>
                             <button type="button" data-action="delete-action-item" data-index="${index}" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                        </div>
                    </div>
                `).join('');
            }
            lucide.createIcons();
            updateActionPlanCompletionStatus(); // Update status whenever the plan is re-rendered
        };

        const setupActionPlanListeners = () => {
            document.getElementById('add-action-item-btn')?.addEventListener('click', () => {
                const descriptionInput = document.getElementById('new-action-description');
                const assigneeSelect = document.getElementById('new-action-assignee');
                const dueDateInput = document.getElementById('new-action-duedate');

                const description = descriptionInput.value.trim();
                if (!description) {
                    showToast('La descripción de la acción no puede estar vacía.', 'error');
                    return;
                }

                const selectedOption = assigneeSelect.options[assigneeSelect.selectedIndex];
                const assigneeUid = assigneeSelect.value;
                const assigneeName = selectedOption.text;
                const ecoId = ecrInput.value.trim();

                const newAction = {
                    id: `task_${Date.now()}`,
                    description,
                    assignee: assigneeName,
                    assigneeUid: assigneeUid,
                    dueDate: dueDateInput.value,
                    status: 'pending'
                };
                actionPlan.push(newAction);

                if (assigneeUid) {
                    sendNotification(
                        assigneeUid,
                        `Se te ha asignado una nueva tarea en el plan de acción para el ECO: ${ecoId}.`,
                        'eco_form',
                        { ecoId: ecoId }
                    );
                }

                descriptionInput.value = '';
                dueDateInput.value = '';
                assigneeSelect.selectedIndex = 0;
                renderActionPlan();
                saveEcoFormToLocalStorage(); // Save progress after adding
            });

            document.getElementById('action-plan-list')?.addEventListener('click', (e) => {
                const target = e.target;
                const action = target.dataset.action;
                const index = parseInt(target.dataset.index, 10);

                if (action === 'toggle-action-status') {
                    actionPlan[index].status = target.checked ? 'completed' : 'pending';
                    renderActionPlan();
                    saveEcoFormToLocalStorage();
                } else if (action === 'delete-action-item') {
                    actionPlan.splice(index, 1);
                    renderActionPlan();
                    saveEcoFormToLocalStorage();
                }
            });
        };

        const populateAssigneeDropdown = () => {
             const assigneeSelect = document.getElementById('new-action-assignee');
             if (!assigneeSelect) return;
             const users = appState.collections.usuarios.filter(u => !u.disabled);
             assigneeSelect.innerHTML = '<option value="">Sin Asignar</option>' + users.map(u => `<option value="${u.docId}">${u.name}</option>`).join('');
        };


        // Always add a "Back" button
        const backButtonHTML = `<button type="button" id="eco-back-button" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300">Volver a la Lista</button>`;
        saveButton.insertAdjacentHTML('beforebegin', backButtonHTML);
        document.getElementById('eco-back-button').addEventListener('click', () => switchView('eco'));

        if (isEditing) {
            ecrInput.readOnly = true;
            ecrInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        }

        if (ecoId) {
            // Editing an existing ECO
            const docRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                populateEcoForm(formElement, data);
                actionPlan = data.action_plan || [];
                // This is the crucial fix: update the checkbox state after loading data.
                updateActionPlanCompletionStatus();
                 // Fetch associated ECR to check for PPAP requirement
                let ecrDocSnap;
                if (window.isInTutorial) {
                    console.log("TUTORIAL MODE: Using mock ECR data.");
                    ecrDocSnap = {
                        exists: () => true,
                        data: () => ({
                            cliente_requiere_ppap: true,
                            cliente_aprobacion_estado: 'aprobado',
                            denominacion_producto: 'Componente de Tutorial',
                            id: 'TUTORIAL-ECR-001'
                        })
                    };
                } else {
                    const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecoId);
                    ecrDocSnap = await getDoc(ecrDocRef);
                }

                if (ecrDocSnap.exists()) {
                    const ecrData = ecrDocSnap.data();
                    const ecrNoDisplay = formElement.querySelector('#ecr_no_display');
                    if (ecrNoDisplay) {
                        ecrNoDisplay.value = `${ecrData.denominacion_producto} (${ecrData.id})`;
                    }
                    if (shouldRequirePpapConfirmation(ecrData)) {
                        const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                        if (ppapContainer) {
                            ppapContainer.classList.remove('hidden');
                        }
                    }
                }
            } else {
                showToast(`Error: No se encontró el ECO con ID ${ecoId}`, 'error');
                switchView('eco');
                return;
            }
        } else if (ecrDataFromParam) {
            // Creating a new ECO from an ECR
            ecrInput.value = ecrDataFromParam.id;
            ecrInput.readOnly = true;
            ecrInput.classList.add('bg-gray-100', 'cursor-not-allowed');

            // Pre-populate other relevant fields from the ECR
            const fieldsToPrepopulate = {
                'name_eng_producto': ecrDataFromParam.equipo_c1_2, // Ing. Producto
                'comments_eng_producto': `Basado en la situación propuesta en el ECR ${ecrDataFromParam.id}:\n${ecrDataFromParam.situacion_propuesta || ''}`
            };

            for (const fieldName in fieldsToPrepopulate) {
                const element = formElement.querySelector(`[name="${fieldName}"]`);
                if (element && !element.value) { // Don't overwrite if already has a value (e.g., from local storage)
                    element.value = fieldsToPrepopulate[fieldName];
                }
            }
            if (shouldRequirePpapConfirmation(ecrDataFromParam)) {
                const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                if (ppapContainer) {
                    ppapContainer.classList.remove('hidden');
                }
            }

            // Also check local storage in case the user started filling it and refreshed
            loadEcoFormFromLocalStorage();
        } else {
            // Creating a brand new, blank ECO
            loadEcoFormFromLocalStorage();
        }

        // Initialize Action Plan
        populateAssigneeDropdown();
        renderActionPlan();
        setupActionPlanListeners();

        // Add event listener to save on any input
        formElement.addEventListener('input', saveEcoFormToLocalStorage);

        formElement.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="open-ecr-search-for-eco"]');
            if (button) {
                await openEcrSearchModalForEcoForm(deps);
            }
        });

        const getFormData = () => {
            const data = {
                checklists: {},
                comments: {},
                signatures: {},
                action_plan: actionPlan,
            };

            const formSectionsData = [
                { id: 'eng_producto' }, { id: 'calidad' }, { id: 'eng_proceso' },
                { id: 'doc_calidad' }, { id: 'compras' }, { id: 'logistica' },
                { id: 'implementacion' }, { id: 'aprobacion_final' }
            ];

            for (const element of formElement.elements) {
                if (element.disabled || !element.name || element.tagName === 'BUTTON') {
                    continue;
                }

                const key = element.name;

                if (key.startsWith('check_')) {
                    const [, section, index, type] = key.split('_');
                    if (!data.checklists[section]) data.checklists[section] = [];
                    if (!data.checklists[section][index]) data.checklists[section][index] = { si: false, na: false };
                    data.checklists[section][index][type] = element.checked;
                } else if (key.startsWith('comments_')) {
                    const [, section] = key.split('_');
                    data.comments[section] = element.value;
                } else if (key.startsWith('date_review_') || key.startsWith('status_') || key.startsWith('name_') || key.startsWith('visto_')) {
                    let fieldType, sectionId;
                    const knownSectionIds = formSectionsData.map(s => s.id);
                    for (const id of knownSectionIds) {
                        if (key.endsWith(`_${id}`)) {
                            sectionId = id;
                            fieldType = key.substring(0, key.length - id.length - 1);
                            break;
                        }
                    }
                    if (sectionId && fieldType) {
                        if (!data.signatures[sectionId]) data.signatures[sectionId] = {};
                        if (element.type === 'radio') {
                            if (element.checked) {
                                data.signatures[sectionId][fieldType] = element.value;
                            }
                        } else {
                            data.signatures[sectionId][fieldType] = element.value;
                        }
                    }
                } else {
                    data[key] = element.value;
                }
            }

            return data;
        };

        const saveEcoForm = async (status = 'in-progress') => {
            const formData = getFormData();
            formData.status = status;
            formData.id = ecrInput.value.trim();

            showToast('Validando formulario ECO...', 'info');

            // --- Client-side Validation (migrated from Cloud Function) ---
            if (!formData.id || formData.id.trim() === '') {
                showToast('El campo "ECR N°" no puede estar vacío. Por favor, seleccione un ECR asociado.', 'error');
                return;
            }
            const hasComments = formData.comments && Object.values(formData.comments).some(comment => comment && comment.trim() !== '');
            const hasChecklists = formData.checklists && Object.values(formData.checklists).some(section =>
                section && section.some(item => item && (item.si || item.na))
            );

            if (!hasComments && !hasChecklists) {
                showToast('El formulario ECO está vacío. Agregue al menos un comentario o marque una opción en el checklist.', 'error');
                return;
            }

            const toastId = showToast('Guardando formulario ECO...', 'loading', { duration: 0 });

            // --- Client-side Firestore Write Logic (migrated from Cloud Function) ---
            try {
                const docId = formData.id;
                const docRef = doc(db, COLLECTIONS.ECO_FORMS, docId);
                const historyCollectionRef = collection(docRef, 'history');

                const dataToSave = {
                    ...formData,
                    lastModified: new Date(),
                    modifiedBy: appState.currentUser.email,
                };

                const batch = writeBatch(db);

                // 1. Save the main document
                batch.set(docRef, dataToSave, { merge: true });

                // 2. Save a copy to the history subcollection
                const historyDocRef = doc(historyCollectionRef); // Auto-generate ID for history entry
                batch.set(historyDocRef, dataToSave);

                await batch.commit();

                // Use the toastId to update the loading message to success
                showToast('ECO guardado con éxito.', 'success', { toastId });
                localStorage.removeItem(ECO_FORM_STORAGE_KEY);
                switchView('eco');

            } catch (error) {
                console.error("Error saving ECO form to Firestore:", error);
                // Use the toastId to update the loading message to an error
                showToast(`Error al guardar: ${error.message}`, 'error', { toastId });
            }
        };

        clearButton.addEventListener('click', () => {
            showConfirmationModal('Limpiar Formulario', '¿Está seguro? Se borrará todo el progreso no guardado.', () => {
                formElement.reset();
                localStorage.removeItem(ECO_FORM_STORAGE_KEY);
                showToast('Formulario limpiado.', 'info');
            });
        });

        // This function now handles all validation logic, including the new business rules.
        const validateAndApproveEco = async () => {
            formElement.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
            let errorMessages = [];
            const ERROR_CLASS = 'validation-error';

            // Rule 1: Check for any "NOK" status
            let hasNok = false;
            formSectionsData.forEach(section => {
                if (section.checklist) {
                    const nokRadio = formElement.querySelector(`input[name="status_${section.id}"][value="nok"]`);
                    if (nokRadio && nokRadio.checked) {
                        hasNok = true;
                        nokRadio.closest('.department-footer').classList.add(ERROR_CLASS);
                    }
                }
            });
            if (hasNok) {
                errorMessages.push('No se puede aprobar: una o más secciones están marcadas como "NOK".');
            }

            // Rule 2: Check PPAP confirmation if required
            const ecrNo = formElement.querySelector('[name="ecr_no"]').value;
            if (ecrNo) {
                const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecrNo);
                const ecrDocSnap = await getDoc(ecrDocRef);
                if (ecrDocSnap.exists() && shouldRequirePpapConfirmation(ecrDocSnap.data())) {
                    const ppapContainer = document.getElementById('ppap-confirmation-container');
                    // No need to remove hidden here, as the container should already be visible if this logic runs.
                    const ppapCheckbox = formElement.querySelector('[name="ppap_completed_confirmation"]');
                    if (!ppapCheckbox.checked) {
                        errorMessages.push('Se requiere confirmación de PPAP antes de aprobar este ECO.');
                        ppapContainer.classList.add(ERROR_CLASS);
                    }
                }
            }

            // Rule 3: Validate all fields are filled (original logic)
            formSectionsData.forEach(section => {
                 if (section.checklist) {
                    const statusRadio = formElement.querySelector(`input[name="status_${section.id}"]:checked`);
                    if (!statusRadio) {
                        errorMessages.push(`La sección "${section.title}" debe tener un estado (OK/NOK).`);
                        const statusOptionsContainer = formElement.querySelector(`input[name="status_${section.id}"]`).closest('.status-options');
                        if (statusOptionsContainer) statusOptionsContainer.classList.add(ERROR_CLASS);
                    }
                 }
            });


            if (errorMessages.length > 0) {
                showToast(errorMessages.join(' '), 'error', 5000);
                return;
            }

            showConfirmationModal('Aprobar ECO', '¿Está seguro de que desea aprobar y guardar este ECO? Esta acción registrará la versión actual como aprobada.', () => {
                saveEcoForm('approved');
            });
        };

        saveButton.addEventListener('click', () => saveEcoForm('in-progress'));
        approveButton.addEventListener('click', validateAndApproveEco);

        appState.currentViewCleanup = () => {
            const ecoStyle = document.getElementById('eco-form-styles');
            if(ecoStyle) ecoStyle.remove();
            const printStyle = document.getElementById('print-styles');
            if(printStyle) printStyle.remove();
            formElement.removeEventListener('input', saveEcoFormToLocalStorage);
        };

    } catch (error) {
        console.error("Error loading ECO form:", error);
        dom.viewContent.innerHTML = `<p class="text-red-500">Error al cargar el formulario ECO.</p>`;
    }
}

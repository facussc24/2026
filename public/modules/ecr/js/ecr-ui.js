import { getEcrFormData, checkAndUpdateEcrStatus, registerEcrApproval } from './ecr.js';
import {
    subscribeToEcrList,
    generateEcrWithAI,
    ensureCollectionsAreLoaded,
    COLLECTIONS,
    getEcrDocument,
    saveEcrDocument,
    createNewEcr,
    uploadFile,
    saveEcrDraftToFirestore,
    loadEcrDraftFromFirestore,
    deleteEcrDraftFromFirestore,
    callGenerateEcrProposal,
    callAnalyzeEcrImpacts
} from '/modules/ecr/js/ecr-data.js';
import { createHelpTooltip } from '/utils.js';

let debouncedSave = null;

export async function runEcrLogic(deps) {
    const { db, dom, lucide, switchView, appState } = deps;
    return new Promise(resolve => {
        dom.headerActions.style.display = 'none';

        const viewHTML = `
            <div class="animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-slate-800">Planilla General de ECR</h2>
                        <p class="text-sm text-slate-500">Aquí puede ver, gestionar y crear un nuevo ECR.</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <button data-action="create-new-ecr" data-tutorial-id="create-new-button" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                            <i data-lucide="file-plus-2" class="mr-2 h-5 w-5"></i>Crear Nuevo ECR
                        </button>
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
                            <tbody id="ecr-table-body" data-tutorial-id="ecr-table-body">
                                <tr>
                                    <td colspan="5" class="text-center py-16 text-gray-500">
                                        <div class="flex flex-col items-center gap-3">
                                            <i data-lucide="loader" class="w-12 h-12 text-gray-300 animate-spin"></i>
                                            <h4 class="font-semibold">Cargando ECR...</h4>
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

        dom.viewContent.querySelector('[data-action="create-new-ecr"]').addEventListener('click', () => {
            switchView('ecr_creation_hub');
        });

        let isFirstRender = true;
        const unsubscribe = subscribeToEcrList(db, (ecrList, error) => {
            const ecrTableBody = document.getElementById('ecr-table-body');
            if (!ecrTableBody) return;

            if (error) {
                ecrTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-16 w-16"></i><h3 class="mt-4 text-lg font-semibold">Error al cargar ECR</h3><p class="text-sm">${error.message}</p></div></td></tr>`;
                lucide.createIcons();
            } else if (!ecrList || ecrList.length === 0) {
                ecrTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No se encontraron ECRs</h3><p class="text-sm">Puede crear uno nuevo con el botón de arriba.</p></div></td></tr>`;
            } else {
                let tableRowsHTML = '';
                ecrList.forEach(ecr => {
                    const lastModified = ecr.lastModified?.toDate ? ecr.lastModified.toDate().toLocaleString('es-AR') : 'N/A';
                    const statusColors = { 'in-progress': 'bg-yellow-100 text-yellow-800', 'approved': 'bg-green-100 text-green-800', 'rejected': 'bg-red-100 text-red-800' };
                    const statusText = { 'in-progress': 'En Progreso', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
                    tableRowsHTML += `
                        <tr class="bg-white border-b hover:bg-gray-50">
                            <td class="px-6 py-4 font-medium text-gray-900">${ecr.id || 'N/A'}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColors[ecr.status] || 'bg-gray-100 text-gray-800'}">${statusText[ecr.status] || ecr.status}</span></td>
                            <td class="px-6 py-4">${lastModified}</td>
                            <td class="px-6 py-4">${ecr.modifiedBy || 'N/A'}</td>
                            <td class="px-6 py-4 text-right">
                                <button data-action="view-ecr" data-id="${ecr.id}" class="text-gray-500 hover:text-blue-600 p-1" title="Ver/Editar"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="export-ecr-pdf" data-id="${ecr.id}" class="text-gray-500 hover:text-red-600 p-1" title="Exportar a PDF"><i data-lucide="file-text" class="h-5 w-5 pointer-events-none"></i></button>
                                ${ecr.status === 'approved' ? `<button data-action="generate-eco-from-ecr" data-id="${ecr.id}" class="text-gray-500 hover:text-green-600 p-1" title="Generar ECO desde este ECR"><i data-lucide="file-output" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
                            </td>
                        </tr>`;
                });
                ecrTableBody.innerHTML = tableRowsHTML;
            }
            lucide.createIcons();
            if (isFirstRender) {
                isFirstRender = false;
                resolve();
            }
        });

        appState.currentViewCleanup = () => {
            if (unsubscribe) unsubscribe();
        };
    });
}

function openEcrProductSearchModal(deps) {
    const { dom, appState, lucide } = deps;
    let clientOptions = '<option value="">Todos</option>' + appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
    const modalId = `ecr-prod-search-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Buscar Producto</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="search-ecr-prod-term" class="block text-sm font-medium">Código/Descripción</label>
                        <input type="text" id="search-ecr-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="search-ecr-prod-client" class="block text-sm font-medium">Cliente</label>
                        <select id="search-ecr-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select>
                    </div>
                </div>
                <div id="search-ecr-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div>
            </div>
        </div>
    `;

    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const termInput = modalElement.querySelector('#search-ecr-prod-term');
    const clientSelect = modalElement.querySelector('#search-ecr-prod-client');
    const resultsContainer = modalElement.querySelector('#search-ecr-prod-results');

    const searchHandler = () => {
        const term = termInput.value.toLowerCase();
        const clientId = clientSelect.value;
        let results = appState.collections[COLLECTIONS.PRODUCTOS].filter(p =>
            (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) &&
            (!clientId || p.clienteId === clientId)
        );
        resultsContainer.innerHTML = results.length === 0
            ? `<p class="text-center py-8">No se encontraron productos.</p>`
            : `<div class="space-y-1">${results.map(p => `
                <button data-product-id="${p.id}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center">
                    <div>
                        <p class="font-semibold text-blue-800">${p.descripcion}</p>
                        <p class="text-xs text-gray-500">${p.id}</p>
                    </div>
                    <p class="text-xs text-gray-500">${appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === p.clienteId)?.descripcion || ''}</p>
                </button>
            `).join('')}</div>`;
    };

    const selectHandler = (e) => {
        const button = e.target.closest('button[data-product-id]');
        if (button) {
            const productId = button.dataset.productId;
            const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.id === productId);
            if (product) {
                document.getElementById('codigo_barack').value = product.id;
                document.getElementById('codigo_barack_display').value = `${product.descripcion} (${product.id})`;
                document.getElementById('denominacion_producto').value = product.descripcion;
                const clientSelectInForm = document.getElementById('cliente');
                if (clientSelectInForm && product.clienteId) {
                    clientSelectInForm.value = product.clienteId;
                }
            }
            modalElement.remove();
        }
    };

    termInput.addEventListener('input', searchHandler);
    clientSelect.addEventListener('change', searchHandler);
    resultsContainer.addEventListener('click', selectHandler);
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());

    searchHandler();
}

export async function runEcrCreationHubLogic(deps) {
    const { dom, lucide, switchView, functions, showToast } = deps;
    dom.headerActions.style.display = 'none';
    const viewHTML = `
        <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg animate-fade-in-up">
            <div class="text-center mb-8">
                <i data-lucide="brain-circuit" class="w-16 h-16 mx-auto text-blue-500"></i>
                <h2 class="text-3xl font-bold text-slate-800 mt-4">Creación de ECR Asistida por IA</h2>
                <p class="text-slate-500 mt-2">Describa su solicitud de cambio en lenguaje natural...</p>
            </div>
            <textarea id="ai-ecr-braindump" rows="10" class="w-full border-gray-300 rounded-md shadow-sm" placeholder="Escriba aquí..."></textarea>
            <div class="mt-6 flex justify-center gap-4">
                <button id="generate-ecr-with-ai-btn" class="bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 font-semibold">Generar Borrador con IA</button>
                <button id="create-ecr-manually-btn" class="text-blue-600 font-semibold hover:underline">Crear manualmente</button>
            </div>
        </div>
    `;
    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    document.getElementById('create-ecr-manually-btn').addEventListener('click', () => switchView('ecr_form'));

    document.getElementById('generate-ecr-with-ai-btn').addEventListener('click', async () => {
        const button = document.getElementById('generate-ecr-with-ai-btn');
        const text = document.getElementById('ai-ecr-braindump').value;
        if (text.trim().length < 20) {
            showToast('Por favor, ingrese una descripción más detallada.', 'error');
            return;
        }
        button.disabled = true;
        button.innerHTML = 'Analizando...';
        try {
            const aiDraftData = await generateEcrWithAI(functions, text);
            switchView('ecr_form', { aiDraftData });
        } catch (error) {
            showToast(`Error de la IA: ${error.message}`, 'error');
            button.disabled = false;
            button.innerHTML = 'Generar Borrador con IA';
        }
    });
}

export async function runEcrFormLogic(params = {}, deps) {
    const { db, storage, functions, appState, dom, lucide, showToast, showConfirmationModal, switchView, sendNotification } = deps;
    const { ecrId, scrollToSection, aiDraftData } = params;

    try {
        await ensureCollectionsAreLoaded(db, appState, [
            COLLECTIONS.PROYECTOS,
            COLLECTIONS.CLIENTES,
            COLLECTIONS.PRODUCTOS
        ]);
    } catch (error) {
        dom.viewContent.innerHTML = `<p class="text-red-500 p-8">Error fatal: ${error.message}</p>`;
        return;
    }

    const isEditing = !!ecrId;
    // Main layout for the form view
    dom.viewContent.innerHTML = `
        <div class="max-w-7xl mx-auto my-8 animate-fade-in-up">
            <form id="ecr-form" class="bg-white p-8 rounded-lg shadow-lg border"></form>
            <div id="action-buttons-container" class="mt-8 flex items-center gap-4">
                <button type="button" id="ecr-back-button" class="bg-slate-200 text-slate-800 px-6 py-2 rounded-md hover:bg-slate-300 transition-colors">Volver</button>
                <div class="flex-grow"></div>
                <button type="button" id="ecr-save-draft-button" class="bg-slate-500 text-white px-6 py-2 rounded-md hover:bg-slate-600 transition-colors">Guardar Borrador</button>
                <button type="button" id="ecr-submit-button" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors font-semibold">Enviar para Aprobación</button>
            </div>
        </div>
    `;
    const formContainer = document.getElementById('ecr-form');

    // Fetch and render the external HTML form template
    try {
        const response = await fetch('modules/ecr/views/ecr-form.html');
        if (!response.ok) throw new Error('No se pudo cargar el template del formulario ECR.');
        let html = await response.text();

        // Populate dynamic dropdowns
        const clientOptions = appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
        const projectOptions = appState.collections[COLLECTIONS.PROYECTOS].map(p => `<option value="${p.id}">${p.id}</option>`).join('');
        html = html.replace('<!-- OPTIONS_CLIENTES -->', `<option value="">Seleccione Cliente</option>${clientOptions}`);
        html = html.replace('<!-- OPTIONS_PROYECTOS -->', `<option value="">Seleccione Proyecto</option>${projectOptions}`);

        formContainer.innerHTML = html;
        lucide.createIcons();

        // Update title after rendering
        const formTitle = document.getElementById('ecr-form-title');
        if (formTitle) {
            formTitle.textContent = isEditing ? `Editando ECR #${ecrId}` : 'Nuevo ECR';
        }

    } catch (error) {
        console.error(error);
        formContainer.innerHTML = `<p class="text-red-500 p-4">Error cargando el formulario: ${error.message}</p>`;
        return;
    }

    // --- After render, add event listeners and logic ---

    const createImageUploader = (type) => {
        const uploadId = `situacion-${type}-image-upload`;
        const previewId = `situacion-${type}-image-preview`;
        const containerId = `situacion-${type}-image-container`;
        const deleteBtnId = `situacion-${type}-image-delete`;
        const dropZoneId = `situacion-${type}-drop-zone`;

        const uploaderHTML = `
            <div id="${containerId}" data-ai-id="situacion_${type}_image_container">
                <div id="${previewId}-wrapper" class="relative hidden mb-2">
                    <img id="${previewId}" src="" alt="Previsualización" class="w-full h-auto max-h-60 object-contain rounded-md border-2 border-gray-300 p-1"/>
                    <button type="button" id="${deleteBtnId}" data-action="delete-image" data-type="${type}" class="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-lg">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
                <div id="${dropZoneId}" class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                    <div class="flex flex-col items-center justify-center">
                        <i data-lucide="upload-cloud" class="w-10 h-10 text-gray-400 mb-2"></i>
                        <p class="text-sm text-gray-600">
                            <span class="font-semibold text-blue-600">Haga clic para cargar</span> o arrastre y suelte
                        </p>
                        <p class="text-xs text-gray-500 mt-1">PNG, JPG, GIF hasta 10MB</p>
                    </div>
                </div>
                <input type="file" id="${uploadId}" name="situacion_${type}_image" class="hidden" accept="image/*">
                <input type="hidden" name="situacion_${type}_image_url">
            </div>
        `;
        return uploaderHTML;
    };

    document.getElementById('image-upload-container-actual').innerHTML = createImageUploader('actual');
    document.getElementById('image-upload-container-propuesta').innerHTML = createImageUploader('propuesta');
    lucide.createIcons();


    document.getElementById('search-product-btn').addEventListener('click', () => openEcrProductSearchModal(deps));

    const setAIButtonLoadingState = (button, isLoading) => {
        const icon = button.querySelector('i');
        const originalIcon = button.dataset.originalIcon;

        if (isLoading) {
            if (!originalIcon) {
                button.dataset.originalIcon = icon.dataset.lucide;
            }
            button.disabled = true;
            icon.setAttribute('data-lucide', 'loader');
            icon.classList.add('animate-spin');
        } else {
            button.disabled = false;
            if (originalIcon) {
                icon.setAttribute('data-lucide', originalIcon);
                icon.classList.remove('animate-spin');
            }
        }
        lucide.createIcons();
    };

    document.getElementById('ai-suggest-proposal').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const situacionActualText = document.getElementById('situacion_actual_text').value;
        if (situacionActualText.trim().length < 20) {
            showToast('Por favor, describa la situación actual con más detalle antes de usar la IA.', 'error');
            return;
        }

        setAIButtonLoadingState(button, true);
        try {
            const result = await callGenerateEcrProposal(functions, situacionActualText);
            document.getElementById('situacion_propuesta_text').value = result.proposal;
            showToast('Propuesta generada por IA.', 'success');
        } catch (error) {
            showToast(`Error de la IA: ${error.message}`, 'error');
        } finally {
            setAIButtonLoadingState(button, false);
        }
    });

    document.getElementById('ai-analyze-impacts').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const situacionActualText = document.getElementById('situacion_actual_text').value;
        const situacionPropuestaText = document.getElementById('situacion_propuesta_text').value;

        if (situacionActualText.trim().length < 20 || situacionPropuestaText.trim().length < 20) {
            showToast('Por favor, complete ambas situaciones con detalle antes de analizar el impacto.', 'error');
            return;
        }

        setAIButtonLoadingState(button, true);
        try {
            const impacts = await callAnalyzeEcrImpacts(functions, situacionActualText, situacionPropuestaText);
            for (const key in impacts) {
                const checkbox = formContainer.elements[key];
                if (checkbox) {
                    checkbox.checked = impacts[key];
                }
            }
            showToast('Análisis de impacto completado por IA.', 'success');
        } catch (error) {
            showToast(`Error de la IA: ${error.message}`, 'error');
        } finally {
            setAIButtonLoadingState(button, false);
        }
    });

    const populateForm = (data) => {
        for (const key in data) {
            const element = formContainer.elements[key];
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = data[key];
                } else {
                    element.value = data[key];
                }
            }
        }
        // Handle display field for product search
        if (data.codigo_barack && data.denominacion_producto) {
            const display = document.getElementById('codigo_barack_display');
            if(display) display.value = `${data.denominacion_producto} (${data.codigo_barack})`;
        }
    };

    if (isEditing) {
        getEcrDocument(db, ecrId).then(ecrData => {
            populateForm(ecrData);
        }).catch(error => {
            showToast(`Error al cargar el ECR: ${error.message}`, 'error');
        });
    } else if (aiDraftData) {
        populateForm(aiDraftData);
    }

    const handleImageUpload = async (file, type) => {
        const urlInput = formContainer.elements[`situacion_${type}_image_url`];
        const previewId = `situacion-${type}-image-preview`;
        const previewWrapper = document.getElementById(`${previewId}-wrapper`);
        const dropZone = document.getElementById(`situacion-${type}-drop-zone`);

        try {
            const path = `ecr_images/${ecrId || `draft_${Date.now()}`}/${type}-${file.name}`;
            const url = await uploadFile(storage, path, file);

            urlInput.value = url;
            document.getElementById(previewId).src = url;
            previewWrapper.classList.remove('hidden');
            dropZone.classList.add('hidden');
        } catch (error) {
            showToast(`Error al subir imagen: ${error.message}`, 'error');
        }
    };

    ['actual', 'propuesta'].forEach(type => {
        const uploadInput = document.getElementById(`situacion-${type}-image-upload`);
        const dropZone = document.getElementById(`situacion-${type}-drop-zone`);

        dropZone.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                handleImageUpload(e.target.files[0], type);
            }
        });
    });

    const saveProgress = async () => {
        const data = getEcrFormData(formContainer);
        const draftId = ecrId || 'new_ecr';
        await saveEcrDraftToFirestore(db, appState.currentUser.uid, draftId, data);
        showToast('Borrador guardado.', 'success');
    };

    debouncedSave = setTimeout(saveProgress, 30000);

    document.getElementById('ecr-save-draft-button').addEventListener('click', saveProgress);

    document.getElementById('ecr-submit-button').addEventListener('click', async (e) => {
        e.target.disabled = true;
        e.target.innerHTML = 'Enviando...';

        const dataToSave = getEcrFormData(formContainer);
        dataToSave.lastModified = new Date();
        dataToSave.modifiedBy = appState.currentUser.email;
        dataToSave.creatorUid = appState.currentUser.uid;
        dataToSave.status = 'pending-approval'; // Status for submission

        try {
            let finalEcrId = ecrId;
            if (isEditing) {
                await saveEcrDocument(db, ecrId, dataToSave);
                showToast(`ECR #${ecrId} actualizado y enviado para aprobación.`, 'success');
            } else {
                const newId = await createNewEcr(db, dataToSave);
                finalEcrId = newId;
                showToast(`ECR #${newId} creado y enviado para aprobación.`, 'success');
                await deleteEcrDraftFromFirestore(db, appState.currentUser.uid, 'new_ecr');
            }
            switchView('ecr');
        } catch (error) {
            showToast(`Error al enviar ECR: ${error.message}`, 'error');
            e.target.disabled = false;
            e.target.innerHTML = 'Enviar para Aprobación';
        }
    });

    document.getElementById('ecr-back-button').addEventListener('click', () => switchView('ecr'));

    appState.currentViewCleanup = () => {
        clearTimeout(debouncedSave);
    };
}

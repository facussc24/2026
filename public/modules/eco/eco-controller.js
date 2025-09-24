/**
 * @file Contains all UI rendering and control logic for the ECO module.
 */
import { COLLECTIONS } from '/utils.js';
import {
    formSectionsData,
    getWizardLayoutHTML,
    buildWizardStepsHTML,
    buildSectionHTML,
    buildActionPlanHTML,
    buildWizardNavHTML
} from './eco-dom.js';
import { saveEcoForm, validateAndApproveEco, getFormData, callAI } from './eco-logic.js';

async function openEcrSearchModalForEcoForm(deps) {
    const { db, firestore, dom, lucide, appState, showToast, ensureCollectionsAreLoaded } = deps;
    const { collection, query, where, getDocs } = firestore;
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
                <div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Seleccionar ECR Aprobado</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div>
                <div class="p-4 border-b"><input type="text" id="ecr-search-input-modal" placeholder="Buscar por N°, producto o cliente..." class="w-full p-2 border rounded-md"></div>
                <div id="ecr-list-container" class="p-6 overflow-y-auto"></div>
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
                <div class="flex justify-between items-center"><p class="font-bold text-blue-800">${ecr.id}</p><p class="text-xs text-slate-500">Cliente: ${ecr.cliente || 'N/A'}</p></div>
                <p class="text-sm text-slate-700">${ecr.denominacion_producto || 'Sin descripción'}</p>
            </button>`).join('');
    };

    modalElement.querySelector('#ecr-search-input-modal').addEventListener('input', e => renderList(e.target.value));
    modalElement.querySelector('#ecr-list-container').addEventListener('click', e => {
        const button = e.target.closest('button[data-ecr-id]');
        if (button) {
            const ecrId = button.dataset.ecrId;
            const ecrData = approvedEcrs.find(ecr => ecr.id === ecrId);
            if (ecrData) {
                document.getElementById('ecr_no').value = ecrData.id;
                document.getElementById('ecr_no_display').value = `${ecrData.denominacion_producto} (${ecrData.id})`;
            }
            modalElement.remove();
        }
    });
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    renderList();
}

export function renderEcoListView(deps) {
    const { db, firestore, dom, lucide, switchView } = deps;
    const { collection, query, orderBy, onSnapshot } = firestore;

    return new Promise(resolve => {
        dom.headerActions.style.display = 'none';
        const viewHTML = `
            <div class="animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div><h2 class="text-2xl font-bold text-slate-800">Planilla General de ECO</h2><p class="text-sm text-slate-500">Aquí puede ver y gestionar sus ECOs.</p></div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg"><div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-gray-600">
                        <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>
                            <th scope="col" class="px-6 py-3">ECR N°</th><th scope="col" class="px-6 py-3">Estado</th><th scope="col" class="px-6 py-3">Última Modificación</th><th scope="col" class="px-6 py-3">Modificado Por</th><th scope="col" class="px-6 py-3 text-right">Acciones</th>
                        </tr></thead>
                        <tbody id="eco-table-body"><tr><td colspan="5" class="text-center py-16 text-gray-500"><div class="flex flex-col items-center gap-3"><i data-lucide="loader" class="w-12 h-12 text-gray-300 animate-spin"></i><h4 class="font-semibold">Cargando ECO...</h4></div></td></tr></tbody>
                    </table>
                </div></div>
            </div>`;
        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        const q = query(collection(db, 'eco_forms'), orderBy('lastModified', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ecoTableBody = document.getElementById('eco-table-body');
            if (!ecoTableBody) return;
            if (querySnapshot.empty) {
                ecoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No se encontraron ECOs</h3></td></tr>`;
                lucide.createIcons();
            } else {
                ecoTableBody.innerHTML = querySnapshot.docs.map(doc => {
                    const eco = doc.data();
                    const lastModified = eco.lastModified?.toDate ? eco.lastModified.toDate().toLocaleString('es-AR') : 'N/A';
                    const statusColors = { 'in-progress': 'bg-yellow-100 text-yellow-800', 'approved': 'bg-green-100 text-green-800', 'rejected': 'bg-red-100 text-red-800' };
                    const statusText = { 'in-progress': 'En Progreso', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
                    return `<tr class="bg-white border-b hover:bg-gray-50">
                        <td class="px-6 py-4 font-medium text-gray-900">${eco.id || 'N/A'}</td>
                        <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColors[eco.status] || 'bg-gray-100 text-gray-800'}">${statusText[eco.status] || eco.status}</span></td>
                        <td class="px-6 py-4">${lastModified}</td>
                        <td class="px-6 py-4">${eco.modifiedBy || 'N/A'}</td>
                        <td class="px-6 py-4 text-right">
                            <button data-action="view-eco" data-id="${eco.id}" class="text-gray-500 hover:text-blue-600 p-1" title="Ver/Editar"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                            <button data-action="view-eco-history" data-id="${eco.id}" class="text-gray-500 hover:text-purple-600 p-1" title="Ver Historial"><i data-lucide="history" class="h-5 w-5 pointer-events-none"></i></button>
                            <button data-action="export-eco-pdf" data-id="${eco.id}" class="text-gray-500 hover:text-red-600 p-1" title="Exportar a PDF"><i data-lucide="file-text" class="h-5 w-5 pointer-events-none"></i></button>
                        </td></tr>`;
                }).join('');
            }
            lucide.createIcons();
            resolve(unsubscribe);
        }, (error) => {
            console.error("Error fetching ECOs: ", error);
            dom.viewContent.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-16 w-16"></i><h3 class="mt-4 text-lg font-semibold">Error al cargar ECO</h3></td></tr>`;
            lucide.createIcons();
            resolve(() => {});
        });
    });
}

export async function renderEcoFormView(params = null, deps) {
    const { db, firestore, dom, lucide, appState, showToast, switchView } = deps;
    const { doc, getDoc } = firestore;

    const ecoId = params?.ecoId;
    const ecrDataFromParam = params?.ecrData;
    const isEditing = !!ecoId;
    const ECO_FORM_STORAGE_KEY = isEditing ? `inProgressEcoForm_${ecoId}` : (ecrDataFromParam ? `inProgressEcoForm_from_ecr_${ecrDataFromParam.id}` : 'inProgressEcoForm_new');
    deps.ECO_FORM_STORAGE_KEY = ECO_FORM_STORAGE_KEY;

    let currentStep = 0;
    let actionPlan = [];

    dom.viewContent.innerHTML = '';
    const formElement = document.createElement('form');
    formElement.id = 'eco-form';
    formElement.className = 'max-w-7xl mx-auto';
    formElement.innerHTML = getWizardLayoutHTML();
    dom.viewContent.appendChild(formElement);

    const wizardContent = formElement.querySelector('#wizard-content');
    formSectionsData.forEach((section, index) => {
        wizardContent.insertAdjacentHTML('beforeend', buildSectionHTML(section, index));
    });

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
    };

    const populateAssigneeDropdown = () => {
         const assigneeSelect = document.getElementById('new-action-assignee');
         if (!assigneeSelect) return;
         const users = appState.collections.usuarios.filter(u => !u.disabled);
         assigneeSelect.innerHTML = '<option value="">Sin Asignar</option>' + users.map(u => `<option value="${u.docId}">${u.name}</option>`).join('');
    };

    const renderWizard = () => {
        const wizardStepsContainer = formElement.querySelector('#wizard-steps');
        wizardStepsContainer.innerHTML = buildWizardStepsHTML(currentStep);

        const wizardNavContainer = formElement.querySelector('#wizard-navigation');
        wizardNavContainer.innerHTML = buildWizardNavHTML(currentStep);

        const steps = formElement.querySelectorAll('[data-step]');
        steps.forEach(step => {
            step.classList.toggle('hidden', parseInt(step.dataset.step) !== currentStep);
        });
        lucide.createIcons();
    }

    const populateEcoForm = (data) => {
        if (!data || !formElement) return;

        // Populate checklists, comments, and signatures
        for (const key in data) {
            if (key === 'checklists' && typeof data.checklists === 'object') {
                for (const section in data.checklists) {
                    data.checklists[section].forEach((item, index) => {
                        const siCheckbox = formElement.querySelector(`input[name="check_${section}_${index}_si"]`);
                        if (siCheckbox) siCheckbox.checked = !!item.si;
                        const naCheckbox = formElement.querySelector(`input[name="check_${section}_${index}_na"]`);
                        if (naCheckbox) naCheckbox.checked = !!item.na;
                    });
                }
            } else if (key === 'comments' && typeof data.comments === 'object') {
                for (const section in data.comments) {
                    const textarea = formElement.querySelector(`[name="comments_${section}"]`);
                    if (textarea) textarea.value = data.comments[section];
                }
            } else if (key === 'signatures' && typeof data.signatures === 'object') {
                for (const sectionId in data.signatures) {
                    for (const field in data.signatures[sectionId]) {
                        // The field name in the data is, e.g., 'date_review_eng_producto'
                        // but the input name is just 'date_review_eng_producto'
                        const inputName = field;
                        const inputElement = formElement.querySelector(`[name="${inputName}"]`);
                        if (inputElement) {
                            if (inputElement.type === 'radio') {
                                const radioToSelect = formElement.querySelector(`[name="${inputName}"][value="${data.signatures[sectionId][field]}"]`);
                                if (radioToSelect) radioToSelect.checked = true;
                            } else {
                                inputElement.value = data.signatures[sectionId][field];
                            }
                        }
                    }
                }
            } else if (key === 'action_plan' && Array.isArray(data.action_plan)) {
                // If AI provides an action plan, merge it with the existing one
                actionPlan = [...actionPlan, ...data.action_plan];
                renderActionPlan();
            } else {
                const element = formElement.querySelector(`[name="${key}"]`);
                if (element) {
                    element.value = data[key];
                }
            }
        }
    };

    const saveEcoFormToLocalStorage = () => {
        const data = getFormData(formElement, actionPlan, formSectionsData);
        localStorage.setItem(ECO_FORM_STORAGE_KEY, JSON.stringify(data));
    };

    const loadEcoFormFromLocalStorage = () => {
        const savedData = localStorage.getItem(ECO_FORM_STORAGE_KEY);
        if (savedData) {
            populateEcoForm(JSON.parse(savedData));
        }
    };

    formElement.addEventListener('click', async (e) => {
        const target = e.target;
        const button = target.closest('button[data-action]');
        const actionTarget = button || target;
        const action = actionTarget.dataset.action;

        if (!action) return;

        switch (action) {
            case 'open-ecr-search-for-eco':
                await openEcrSearchModalForEcoForm(deps);
                break;
            case 'next-step':
                if (currentStep < formSectionsData.length - 1) {
                    currentStep++;
                    renderWizard();
                }
                break;
            case 'prev-step':
                if (currentStep > 0) {
                    currentStep--;
                    renderWizard();
                }
                break;
            case 'save-progress':
                const formDataForSave = getFormData(formElement, actionPlan, formSectionsData);
                await saveEcoForm('in-progress', deps, formDataForSave);
                break;
            case 'approve':
                await validateAndApproveEco(deps, formElement, formSectionsData, actionPlan);
                break;
            case 'generate-ai-comment':
                const sectionId = actionTarget.dataset.sectionId;
                const prompt = `Generar comentarios para la sección ${sectionId} del formulario ECO.`;
                const aiResponse = await callAI(prompt);
                const commentArea = formElement.querySelector(`#comments_${sectionId}`);
                commentArea.value = aiResponse;
                break;
            case 'fill-all-with-ai':
                const ecrInfo = document.getElementById('ecr_no_display').value;
                const fillPrompt = `Rellenar el formulario ECO completo basado en la información del ECR: ${ecrInfo}`;
                const aiFullResponse = await fillAllWithAI(fillPrompt);
                populateEcoForm(aiFullResponse);
                showToast('Formulario rellenado con datos de la IA.', 'success');
                break;
            case 'ai-generate-action-plan':
                const actionPlanPrompt = "Basado en el ECR y las secciones completadas, sugiere un plan de acción. Formato: Tarea | Responsable | Fecha Límite.";
                const aiActionPlan = await callAI(actionPlanPrompt);
                const newActions = aiActionPlan.split(';').map(line => {
                    const parts = line.split('|');
                    return { id: `task_${Date.now()}`, description: parts[0]?.trim() || 'Tarea de IA', assignee: parts[1]?.trim() || '', dueDate: parts[2]?.trim() || '', status: 'pending' };
                });
                actionPlan.push(...newActions);
                renderActionPlan();
                break;
            case 'add-action-item':
                const descriptionInput = document.getElementById('new-action-description');
                const assigneeSelect = document.getElementById('new-action-assignee');
                const dueDateInput = document.getElementById('new-action-duedate');
                const description = descriptionInput.value.trim();
                if (!description) {
                    showToast('La descripción de la acción no puede estar vacía.', 'error');
                    return;
                }
                const selectedOption = assigneeSelect.options[assigneeSelect.selectedIndex];
                actionPlan.push({ id: `task_${Date.now()}`, description, assignee: selectedOption.text, assigneeUid: selectedOption.value, dueDate: dueDateInput.value, status: 'pending' });
                descriptionInput.value = '';
                dueDateInput.value = '';
                assigneeSelect.selectedIndex = 0;
                renderActionPlan();
                saveEcoFormToLocalStorage();
                break;
            case 'toggle-action-status':
                const toggleIndex = parseInt(actionTarget.dataset.index, 10);
                actionPlan[toggleIndex].status = actionTarget.checked ? 'completed' : 'pending';
                renderActionPlan();
                saveEcoFormToLocalStorage();
                break;
            case 'delete-action-item':
                const deleteIndex = parseInt(actionTarget.dataset.index, 10);
                actionPlan.splice(deleteIndex, 1);
                renderActionPlan();
                saveEcoFormToLocalStorage();
                break;
            case 'eco-back-button':
                 switchView('eco');
                 break;
        }
    });

    if (ecoId) {
        const docRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            populateEcoForm(data);
            actionPlan = data.action_plan || [];
        }
    } else {
        loadEcoFormFromLocalStorage();
    }

    renderWizard();
    lucide.createIcons();
    populateAssigneeDropdown();
    renderActionPlan();
}

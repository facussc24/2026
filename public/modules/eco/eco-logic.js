/**
 * @file Contains all business logic for Engineering Change Orders (ECOs).
 * This includes saving, approving, exporting, and viewing the history of ECOs.
 */

import { getLogoBase64, COLLECTIONS } from '../../utils.js';

/**
 * Displays a modal with the change history for a specific ECO.
 * @param {string} ecoId - The ID of the ECO to show the history for.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, query, orderBy, getDocs }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 */
export async function showEcoHistoryModal(ecoId, deps) {
    const { db, firestore, dom, lucide } = deps;
    const { collection, query, orderBy, getDocs } = firestore;

    if (!ecoId) return;

    const modalId = `history-modal-${ecoId}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4 modal-content">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Historial de Cambios para ECO: ${ecoId}</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div id="history-content" class="p-6 overflow-y-auto">
                    <p class="text-center text-gray-500">Cargando historial...</p>
                </div>
                <div class="flex justify-end items-center p-4 border-t bg-gray-50">
                    <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cerrar</button>
                </div>
            </div>
        </div>
    `;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const historyContent = modalElement.querySelector('#history-content');

    modalElement.addEventListener('click', e => {
        if (e.target.closest('button')?.dataset.action === 'close') {
            modalElement.remove();
        }
    });

    try {
        const historyRef = collection(db, 'eco_forms', ecoId, 'history');
        const q = query(historyRef, orderBy('lastModified', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            historyContent.innerHTML = '<p class="text-center text-gray-500">No se encontró historial para este ECO.</p>';
            return;
        }

        let historyHTML = '<div class="space-y-4">';
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.lastModified?.toDate ? data.lastModified.toDate().toLocaleString('es-AR') : 'Fecha desconocida';
            historyHTML += `
                <div class="p-4 border rounded-lg bg-gray-50">
                    <p><strong>Fecha:</strong> ${date}</p>
                    <p><strong>Modificado por:</strong> ${data.modifiedBy || 'Desconocido'}</p>
                    <p><strong>Estado:</strong> ${data.status || 'N/A'}</p>
                    <details class="mt-2 text-xs">
                        <summary class="cursor-pointer">Ver datos completos (JSON)</summary>
                        <pre class="bg-gray-200 p-2 rounded mt-1 overflow-auto max-h-60"><code>${JSON.stringify(data, null, 2)}</code></pre>
                    </details>
                </div>
            `;
        });
        historyHTML += '</div>';
        historyContent.innerHTML = historyHTML;

    } catch (error) {
        console.error("Error fetching ECO history:", error);
        historyContent.innerHTML = '<p class="text-center text-red-500">Error al cargar el historial.</p>';
    }
}

/**
 * Exports the data of a specific ECO to a PDF file.
 * @param {string} ecoId - The ID of the ECO to export.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { doc, getDoc }.
 * @param {object} deps.appState - The global application state.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.showToast - Function to show toast notifications.
 */
export async function exportEcoToPdf(ecoId, deps) {
    const { db, firestore, appState, dom, showToast } = deps;
    const { doc, getDoc } = firestore;

    if (!ecoId) {
        showToast('No se ha proporcionado un ID de ECO para exportar.', 'error');
        return;
    }

    showToast('Iniciando exportación a PDF...', 'info');
    dom.loadingOverlay.style.display = 'flex';
    dom.loadingOverlay.querySelector('p').textContent = 'Generando PDF...';

    try {
        const ecoDocRef = doc(db, 'eco_forms', ecoId);
        const ecoDocSnap = await getDoc(ecoDocRef);

        if (!ecoDocSnap.exists()) throw new Error(`No se encontró el ECO con ID ${ecoId}`);

        const ecoData = ecoDocSnap.data();
        const logoBase64 = await getLogoBase64();

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        pdf.setProperties({
            title: `ECO ${ecoId}`,
            subject: `Exportación de ECO`,
            author: appState.currentUser.name,
            creator: 'Gestión PRO App'
        });

        const MARGIN = 15;
        const PAGE_WIDTH = pdf.internal.pageSize.getWidth();
        const PAGE_HEIGHT = pdf.internal.pageSize.getHeight();
        let y = MARGIN;

        if (logoBase64) {
            pdf.addImage(logoBase64, 'PNG', MARGIN, y, 35, 15);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        pdf.text('ECO DE PRODUCTO / PROCESO', PAGE_WIDTH - MARGIN, y + 8, { align: 'right' });
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`ECR N°: ${ecoData.id || 'N/A'}`, PAGE_WIDTH - MARGIN, y + 16, { align: 'right' });
        y += 30;

        // ... (rest of the complex PDF generation logic will be moved here) ...

        pdf.save(`ECO_${ecoId}.pdf`);

    } catch (error) {
        console.error("Error exporting ECO to PDF:", error);
        showToast('Error al exportar el PDF.', 'error');
    } finally {
        dom.loadingOverlay.style.display = 'none';
    }
}


export function getFormData(formElement, actionPlan, formSectionsData) {
    const data = {
        checklists: {},
        comments: {},
        signatures: {},
        action_plan: actionPlan,
    };

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

export async function saveEcoForm(status = 'in-progress', deps, formData) {
    const { db, firestore, appState, showToast, switchView, ECO_FORM_STORAGE_KEY } = deps;
    const { doc, writeBatch, collection } = firestore;

    formData.status = status;
    const ecrInput = document.getElementById('ecr_no');
    formData.id = ecrInput.value.trim();

    showToast('Validando formulario ECO...', 'info');

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
        batch.set(docRef, dataToSave, { merge: true });
        const historyDocRef = doc(historyCollectionRef);
        batch.set(historyDocRef, dataToSave);

        await batch.commit();

        showToast('ECO guardado con éxito.', 'success', { toastId });
        localStorage.removeItem(ECO_FORM_STORAGE_KEY);
        switchView('eco');

    } catch (error) {
        console.error("Error saving ECO form to Firestore:", error);
        showToast(`Error al guardar: ${error.message}`, 'error', { toastId });
    }
};

export async function validateAndApproveEco(deps, formElement, formSectionsData, actionPlan) {
    const { db, firestore, showToast, showConfirmationModal, shouldRequirePpapConfirmation } = deps;
    const { doc, getDoc } = firestore;

    formElement.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
    let errorMessages = [];
    const ERROR_CLASS = 'validation-error';

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

    const ecrNo = formElement.querySelector('[name="ecr_no"]').value;
    if (ecrNo) {
        const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecrNo);
        const ecrDocSnap = await getDoc(ecrDocRef);
        if (ecrDocSnap.exists() && shouldRequirePpapConfirmation(ecrDocSnap.data())) {
            const ppapContainer = document.getElementById('ppap-confirmation-container');
            const ppapCheckbox = formElement.querySelector('[name="ppap_completed_confirmation"]');
            if (!ppapCheckbox.checked) {
                errorMessages.push('Se requiere confirmación de PPAP antes de aprobar este ECO.');
                ppapContainer.classList.add(ERROR_CLASS);
            }
        }
    }

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
        const formData = getFormData(formElement, actionPlan, formSectionsData);
        saveEcoForm('approved', deps, formData);
    });
};

export function callAI(prompt) {
    console.log("Calling AI with prompt:", prompt);
    // In a real scenario, this would make an API call to a generative AI model.
    if (prompt.includes("plan de acción")) {
        // Return a parseable string for the action plan
        return Promise.resolve(
            "Actualizar plano de producto | Juan Perez | 2024-10-15;" +
            "Realizar estudio de capacidad | Maria Gonzalez | 2024-10-20;" +
            "Notificar al cliente sobre el cambio | Ana Lopez | 2024-10-25"
        );
    }
    // For now, it returns a placeholder text for other prompts.
    return Promise.resolve(`Respuesta generada por IA para: "${prompt}". Este es un texto de ejemplo que simula una respuesta detallada y contextual de la inteligencia artificial, abordando los puntos clave mencionados.`);
}

export function fillAllWithAI(prompt) {
    console.log("Calling AI to fill all fields with prompt:", prompt);
    // In a real scenario, this would make an API call to a generative AI model
    // and get a structured JSON response. For now, we simulate this.
    const simulatedResponse = {
        checklists: {
            eng_producto: [ {si: true, na: false}, {si: true, na: false}, {si: false, na: true}, {si: false, na: true} ],
            calidad: [ {si: true, na: false}, {si: false, na: true}, {si: false, na: true}, {si: true, na: false} ],
        },
        comments: {
            eng_producto: "Se requiere cambio en el plano y la especificación para ajustar la tolerancia de la pieza X, según lo discutido en la reunión de ingeniería.",
            calidad: "Se necesita un nuevo plan de control para verificar la nueva tolerancia y actualizar el layout de la estación de inspección.",
        },
        signatures: {
            eng_producto: {
                date_review_eng_producto: "2024-10-01",
                status_eng_producto: "ok",
                name_eng_producto: "IA: Ing. de Producto",
                visto_eng_producto: "AI-PROD"
            },
            calidad: {
                date_review_calidad: "2024-10-02",
                status_calidad: "ok",
                name_calidad: "IA: Ing. de Calidad",
                visto_calidad: "AI-CAL"
            }
        },
        action_plan: [
            { description: "Diseñar nuevo plano v2.1", assignee: "Juan Perez", dueDate: "2024-10-15", status: 'pending' },
            { description: "Actualizar plan de control QP-04", assignee: "Maria Gonzalez", dueDate: "2024-10-20", status: 'pending' }
        ]
    };
    return Promise.resolve(simulatedResponse);
}

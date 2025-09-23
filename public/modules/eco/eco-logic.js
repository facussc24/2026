/**
 * @file Contains all business logic for Engineering Change Orders (ECOs).
 * This includes saving, approving, exporting, and viewing the history of ECOs.
 */

import { getLogoBase64 } from '../../utils.js';

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

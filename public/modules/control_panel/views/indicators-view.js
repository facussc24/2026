/**
 * @file Manages the Indicators ECM View, which shows KPIs for ECR/ECO processes.
 */
import { COLLECTIONS } from '/utils.js';

function createKpiCard(title, value, icon, color) {
    const colors = {
        blue: 'bg-blue-100 text-blue-600',
        red: 'bg-red-100 text-red-600',
        green: 'bg-green-100 text-green-600',
        yellow: 'bg-yellow-100 text-yellow-600',
    };
    return `
        <div class="bg-white p-4 rounded-lg shadow-sm border flex items-center gap-4">
            <div class="rounded-full p-3 ${colors[color] || 'bg-gray-100'}">
                <i data-lucide="${icon}" class="w-6 h-6"></i>
            </div>
            <div>
                <p class="text-3xl font-bold text-slate-800">${value}</p>
                <p class="text-sm font-medium text-slate-500">${title}</p>
            </div>
        </div>
    `;
}


/**
 * Renders the Indicators ECM view with charts and KPIs.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {object} deps.appState - The global application state.
 * @param {function} deps.showToast - Function to show a toast notification.
 * @param {function} deps.showConfirmationModal - Function to show a confirmation modal.
 */
export function renderIndicatorsView(deps) {
    const { db, firestore, dom, lucide, appState, showToast, showConfirmationModal } = deps;
    const { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } = firestore;

    dom.headerActions.style.display = 'none';
    let activeDashboardUnsub = null;
    let ecrChart = null;
    let ecoChart = null;
    let obsoletosChart = null;
    let actionPlanUnsub = null;

    const cleanup = () => {
        if (ecrChart) ecrChart.destroy();
        if (ecoChart) ecoChart.destroy();
        if (obsoletosChart) obsoletosChart.destroy();
        ecrChart = null;
        ecoChart = null;
        obsoletosChart = null;
        if (activeDashboardUnsub) {
            activeDashboardUnsub();
            activeDashboardUnsub = null;
        }
        if (actionPlanUnsub) {
            actionPlanUnsub();
            actionPlanUnsub = null;
        }
    };

    const renderIndicadorEcmView = () => {
        cleanup();
        const currentYear = new Date().getFullYear();
        let yearOptions = '';
        for (let i = 0; i < 5; i++) {
            const year = currentYear - i;
            yearOptions += `<option value="${year}" ${i === 0 ? 'selected' : ''}>${year}</option>`;
        }

        const viewHTML = `
            <div class="animate-fade-in space-y-8" data-tutorial-id="indicadores-ecm-view-container">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                     <div>
                        <button data-view="control_ecrs" class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 mb-2">
                            <i data-lucide="arrow-left" class="w-4 h-4"></i>
                            Volver al Panel de Control
                        </button>
                        <h2 class="text-3xl font-bold text-slate-800">Indicadores ECM</h2>
                    </div>
                    <div class="flex items-center gap-4">
                        <div>
                            <label for="ecm-status-filter" class="text-sm font-medium">Estado:</label>
                            <select id="ecm-status-filter" class="border-gray-300 rounded-md shadow-sm">
                                <option value="all">Todos</option>
                                <option value="approved">Aprobado</option>
                                <option value="in-progress">En Progreso</option>
                                <option value="rejected">Rechazado</option>
                            </select>
                        </div>
                        <div>
                            <label for="ecm-year-filter" class="text-sm font-medium">Período:</label>
                            <select id="ecm-year-filter" class="border-gray-300 rounded-md shadow-sm">${yearOptions}</select>
                        </div>
                    </div>
                </div>

                <!-- ECR Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de ECR</h3>
                    <div id="ecr-kpi-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"></div>
                    <div class="h-80 relative"><canvas id="ecr-doughnut-chart"></canvas></div>
                </section>

                <!-- ECO Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de ECO</h3>
                    <div id="eco-kpi-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"></div>
                    <div class="h-80 relative"><canvas id="eco-pie-chart"></canvas></div>
                </section>

                <!-- Obsoletos Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de Obsoletos Anual</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <table class="w-full text-sm">
                                <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                    <tr><th class="px-4 py-3 text-left">Indicador</th><th class="px-4 py-3 text-right">Valor</th></tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b"><td class="px-4 py-3 font-semibold">CANTIDAD ANUAL</td><td id="obsoletos-anual" class="px-4 py-3 text-right font-mono font-bold">0</td></tr>
                                    <tr class="border-b"><td class="px-4 py-3">CANTIDAD SEMESTRE 1</td><td id="obsoletos-s1" class="px-4 py-3 text-right font-mono">0</td></tr>
                                    <tr class="border-b"><td class="px-4 py-3">CANTIDAD SEMESTRE 2</td><td id="obsoletos-s2" class="px-4 py-3 text-right font-mono">0</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="h-64 relative"><canvas id="obsoletos-bar-chart"></canvas></div>
                    </div>
                </section>

                <!-- Plan de Acción Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Plan de Acción</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th class="px-4 py-3 text-left">Acción</th>
                                    <th class="px-4 py-3 text-left">Responsable</th>
                                    <th class="px-4 py-3 text-left">Plazo</th>
                                    <th class="px-4 py-3 text-center">Realizado</th>
                                    <th class="px-4 py-3 text-right"></th>
                                </tr>
                            </thead>
                            <tbody id="action-plan-tbody">
                                <!-- Rows will be rendered here dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-4 text-right">
                        <button id="add-action-plan-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold">
                            <i data-lucide="plus" class="inline-block w-4 h-4 mr-1.5 -mt-0.5"></i>Agregar Acción
                        </button>
                    </div>
                </section>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        const updateEcmDashboard = () => {
            const yearFilter = document.getElementById('ecm-year-filter');
            const statusFilter = document.getElementById('ecm-status-filter');
            if (!yearFilter || !statusFilter || !appState.isAppInitialized) return;
            const selectedYear = parseInt(yearFilter.value, 10);
            const selectedStatus = statusFilter.value;

            // ECR Data
            let ecrDocs = appState.collections[COLLECTIONS.ECR_FORMS] || [];
            if (selectedStatus !== 'all') {
                ecrDocs = ecrDocs.filter(ecr => ecr.status === selectedStatus);
            }
            const filteredEcrs = ecrDocs.filter(ecr => ecr.fecha_emision && new Date(ecr.fecha_emision + "T00:00:00").getFullYear() === selectedYear);
            let ecrAbierta = 0, ecrCancelada = 0, ecrCerradaPlazo = 0, ecrCerradaFueraPlazo = 0;
            filteredEcrs.forEach(ecr => {
                if (ecr.status === 'in-progress') ecrAbierta++;
                else if (ecr.status === 'rejected') ecrCancelada++;
                else if (ecr.status === 'approved') {
                    if (ecr.fecha_emision && ecr.lastModified?.toDate) {
                        const fechaEmision = new Date(ecr.fecha_emision + "T00:00:00");
                        const fechaCierre = ecr.lastModified.toDate();
                        const diffDays = (fechaCierre - fechaEmision) / (1000 * 60 * 60 * 24);
                        diffDays <= 30 ? ecrCerradaPlazo++ : ecrCerradaFueraPlazo++;
                    }
                }
            });
            document.getElementById('ecr-kpi-cards').innerHTML =
                createKpiCard("ECR Abierta", ecrAbierta, 'file-clock', 'blue') +
                createKpiCard("ECR Cancelada", ecrCancelada, 'file-x', 'red') +
                createKpiCard("Cerrada en Plazo", ecrCerradaPlazo, 'file-check', 'green') +
                createKpiCard("Cerrada Fuera de Plazo", ecrCerradaFueraPlazo, 'file-warning', 'yellow');

            const ecrChartCtx = document.getElementById('ecr-doughnut-chart')?.getContext('2d');
            if (ecrChartCtx) {
                if (ecrChart) ecrChart.destroy();
                try {
                    ecrChart = new Chart(ecrChartCtx, {
                        type: 'doughnut',
                        data: {
                            labels: ["Abiertas", "Canceladas", "En Plazo", "Fuera de Plazo"],
                            datasets: [{
                                data: [ecrAbierta, ecrCancelada, ecrCerradaPlazo, ecrCerradaFueraPlazo],
                                backgroundColor: ['#60a5fa', '#f87171', '#4ade80', '#facc15'],
                                borderColor: '#ffffff',
                                borderWidth: 2
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Distribución de ECRs' } } }
                    });
                } catch (error) {
                    console.error("Error rendering ECR doughnut chart:", error);
                    ecrChartCtx.canvas.parentElement.innerHTML = `<p class="text-red-500 text-center">Error al renderizar gráfico.</p>`;
                }
            }

            // ECO Data
            let ecoDocs = appState.collections[COLLECTIONS.ECO_FORMS] || [];
            if (selectedStatus !== 'all') {
                ecoDocs = ecoDocs.filter(eco => eco.status === selectedStatus);
            }
            const filteredEcos = ecoDocs.filter(eco => eco.lastModified?.toDate && eco.lastModified.toDate().getFullYear() === selectedYear);
            const ecoPendiente = filteredEcos.filter(eco => eco.status === 'in-progress').length;
            const ecoApertura = filteredEcos.filter(eco => eco.status === 'approved').length;
            const ecoRechazada = filteredEcos.filter(eco => eco.status === 'rejected').length;
            document.getElementById('eco-kpi-cards').innerHTML =
                createKpiCard("ECO Pendiente", ecoPendiente, 'hourglass', 'yellow') +
                createKpiCard("ECO Apertura", ecoApertura, 'folder-check', 'green') +
                createKpiCard("ECO Rechazada", ecoRechazada, 'folder-x', 'red');

            const ecoChartCtx = document.getElementById('eco-pie-chart')?.getContext('2d');
            if (ecoChartCtx) {
                if (ecoChart) ecoChart.destroy();
                try {
                    ecoChart = new Chart(ecoChartCtx, {
                        type: 'pie',
                        data: {
                            labels: ["Pendiente", "Apertura", "Rechazada"],
                            datasets: [{
                                data: [ecoPendiente, ecoApertura, ecoRechazada],
                                backgroundColor: ['#facc15', '#4ade80', '#f87171'],
                                borderColor: '#ffffff',
                                borderWidth: 2
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Distribución de ECOs' } } }
                    });
                } catch (error) {
                    console.error("Error rendering ECO pie chart:", error);
                    ecoChartCtx.canvas.parentElement.innerHTML = `<p class="text-red-500 text-center">Error al renderizar gráfico.</p>`;
                }
            }

            // Obsoletos Data (Calculated from ECRs)
            let s1 = 0;
            let s2 = 0;
            if (filteredEcrs && filteredEcrs.length > 0) {
                filteredEcrs.forEach(ecr => {
                    const obsoletosValue = parseInt(ecr.componentes_obsoletos, 10);
                    if (!isNaN(obsoletosValue)) {
                        const ecrDate = new Date(ecr.fecha_emision + "T00:00:00");
                        const month = ecrDate.getMonth();
                        if (month < 6) s1 += obsoletosValue;
                        else s2 += obsoletosValue;
                    }
                });
            }
            document.getElementById('obsoletos-anual').textContent = s1 + s2;
            document.getElementById('obsoletos-s1').textContent = s1;
            document.getElementById('obsoletos-s2').textContent = s2;
            const obsoletosChartCtx = document.getElementById('obsoletos-bar-chart')?.getContext('2d');
            if (obsoletosChartCtx) {
                 if (obsoletosChart) obsoletosChart.destroy();
                 try {
                     obsoletosChart = new Chart(obsoletosChartCtx, {
                        type: 'bar',
                        data: {
                            labels: ['Semestre 1', 'Semestre 2'],
                            datasets: [{ label: 'Cantidad de Obsoletos', data: [s1, s2], backgroundColor: ['#60a5fa', '#3b82f6'], borderRadius: 4, maxBarThickness: 50 }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
                     });
                 } catch (error) {
                    console.error("Error rendering Obsoletos bar chart:", error);
                    obsoletosChartCtx.canvas.parentElement.innerHTML = `<p class="text-red-500 text-center">Error al renderizar gráfico.</p>`;
                 }
            }
            lucide.createIcons();

            // Setup Action Plan listener
            if (actionPlanUnsub) actionPlanUnsub();
            const actionPlanCollection = collection(db, 'action_plans');
            const q = query(actionPlanCollection);
            actionPlanUnsub = onSnapshot(q, (snapshot) => {
                const currentSelectedYear = parseInt(document.getElementById('ecm-year-filter').value, 10);
                const plans = snapshot.docs
                    .map(doc => ({ ...doc.data(), docId: doc.id }))
                    .filter(plan => plan.year === currentSelectedYear);
                renderActionPlan(plans);
            }, (error) => {
                console.error("Error listening to action plans:", error);
                showToast("Error al cargar el plan de acción.", "error");
            });
        };

        const renderActionPlan = (plans) => {
            const tbody = document.getElementById('action-plan-tbody');
            if (!tbody) return;
            tbody.innerHTML = plans.map(plan => `
                <tr class="border-b group" data-id="${plan.docId}">
                    <td class="px-4 py-3" contenteditable="true" data-field="action">${plan.action}</td>
                    <td class="px-4 py-3" contenteditable="true" data-field="responsible">${plan.responsible}</td>
                    <td class="px-4 py-3" contenteditable="true" data-field="deadline">${plan.deadline}</td>
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="action-plan-status h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${plan.status === 'done' ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="delete-action-plan-btn text-slate-400 hover:text-red-600 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                    </td>
                </tr>
            `).join('');
            lucide.createIcons();
        };

        const setupActionPlanListeners = () => {
            const tbody = document.getElementById('action-plan-tbody');
            const addBtn = document.getElementById('add-action-plan-btn');
            if (!tbody || !addBtn) return;

            addBtn.addEventListener('click', async () => {
                const selectedYear = parseInt(document.getElementById('ecm-year-filter').value, 10);
                const newPlan = { action: 'Nueva acción...', responsible: 'Responsable...', deadline: 'dd/mm/aaaa', status: 'pending', year: selectedYear };
                try {
                    await addDoc(collection(db, 'action_plans'), newPlan);
                    showToast('Nueva acción agregada.', 'success');
                } catch (error) {
                    showToast('Error al agregar la acción.', 'error');
                }
            });

            tbody.addEventListener('focusout', async (e) => {
                if (e.target.tagName === 'TD' && e.target.isContentEditable) {
                    const docId = e.target.parentElement.dataset.id;
                    const field = e.target.dataset.field;
                    const value = e.target.textContent;
                    const docRef = doc(db, 'action_plans', docId);
                    try {
                        await updateDoc(docRef, { [field]: value });
                        showToast('Plan de acción actualizado.', 'success');
                    } catch (error) { showToast('Error al actualizar.', 'error'); }
                }
            });

            tbody.addEventListener('change', async (e) => {
                if (e.target.matches('.action-plan-status')) {
                    const docId = e.target.closest('tr').dataset.id;
                    const status = e.target.checked ? 'done' : 'pending';
                    const docRef = doc(db, 'action_plans', docId);
                    try {
                        await updateDoc(docRef, { status: status });
                        showToast('Estado actualizado.', 'success');
                    } catch (error) { showToast('Error al actualizar estado.', 'error'); }
                }
            });

            tbody.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.delete-action-plan-btn');
                if (deleteBtn) {
                    const docId = deleteBtn.closest('tr').dataset.id;
                    showConfirmationModal('Eliminar Acción', '¿Está seguro?', async () => {
                        try {
                            await deleteDoc(doc(db, 'action_plans', docId));
                            showToast('Acción eliminada.', 'success');
                        } catch (error) { showToast('Error al eliminar la acción.', 'error'); }
                    });
                }
            });
        };

        setupActionPlanListeners();
        document.getElementById('ecm-year-filter').addEventListener('change', updateEcmDashboard);
        document.getElementById('ecm-status-filter').addEventListener('change', updateEcmDashboard);
        const unsub1 = onSnapshot(collection(db, COLLECTIONS.ECR_FORMS), updateEcmDashboard);
        const unsub2 = onSnapshot(collection(db, COLLECTIONS.ECO_FORMS), updateEcmDashboard);
        activeDashboardUnsub = () => { unsub1(); unsub2(); };
        updateEcmDashboard();
    };

    renderIndicadorEcmView();
    appState.currentViewCleanup = cleanup;
}

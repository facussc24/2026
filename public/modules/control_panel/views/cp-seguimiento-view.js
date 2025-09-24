/**
 * @file Manages the ECR Seguimiento View, which shows meeting attendance and follow-ups.
 */
import { COLLECTIONS } from '../../utils.js';

/**
 * Renders the ECR Seguimiento view.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {object} deps.appState - The global application state.
 * @param {function} deps.showToast - Function to show a toast notification.
 * @param {function} deps.switchView - Function to switch views.
 * @param {function} deps.showDatePromptModal - Function to show a date prompt modal.
 */
export function renderCpSeguimientoView(deps) {
    const { db, firestore, dom, lucide, appState, showToast, switchView, showDatePromptModal } = deps;
    const { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } = firestore;

    dom.headerActions.style.display = 'none';

    const DEPARTAMENTOS = [
        { id: 'ing_manufatura', label: 'Ing. Manufatura' }, { id: 'hse', label: 'HSE' },
        { id: 'calidad', label: 'Calidad' }, { id: 'compras', label: 'Compras' },
        { id: 'sqa', label: 'Calidad Prov.' }, { id: 'tooling', label: 'Herramental' },
        { id: 'logistica', label: 'Logística PC&L' }, { id: 'financiero', label: 'Finanzas' },
        { id: 'comercial', label: 'Comercial' }, { id: 'mantenimiento', label: 'Mantenimiento' },
        { id: 'produccion', label: 'Producción' }, { id: 'calidad_cliente', label: 'Calidad Cliente' },
        { id: 'ing_producto', label: 'Ing. Producto' }
    ];

    const createPlaceholder = (message, icon = 'loader') => `
        <div class="text-center text-slate-500 py-10 animate-fade-in">
            <i data-lucide="${icon}" class="w-12 h-12 mx-auto text-slate-300 ${icon === 'loader' ? 'animate-spin' : ''}"></i>
            <p class="mt-4 font-semibold">${message}</p>
        </div>
    `;

    const viewHTML = `
        <div class="animate-fade-in-up space-y-8" data-tutorial-id="ecr-seguimiento-view-container">
            <div>
                <button data-view="control_ecrs" class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 mb-2">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                    Volver al Panel de Control
                </button>
            </div>

            <section id="ecr-log-section" class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-slate-800">Registro de ECR</h3>
                    <div class="flex items-center gap-2 text-sm">
                        <div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full bg-green-200 border border-green-400"></div><span>OK</span></div>
                        <div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full bg-red-200 border border-red-400"></div><span>NOK</span></div>
                    </div>
                </div>
                <div id="ecr-log-container">
                    ${createPlaceholder('Cargando registro de ECR...')}
                </div>
            </section>

            <section id="asistencia-matriz-section" class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-slate-800">Matriz de Asistencia a Reuniones</h3>
                    <button id="add-reunion-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold flex items-center gap-2">
                        <i data-lucide="plus"></i> Agregar Reunión
                    </button>
                </div>
                <div id="asistencia-matriz-container">
                    ${createPlaceholder('Cargando matriz de asistencia...')}
                </div>
            </section>

            <section id="resumen-graficos-section" class="bg-white p-6 rounded-xl shadow-lg">
                <h3 class="text-xl font-bold text-slate-800 mb-4">Resumen y Gráficos de Asistencia</h3>
                <div id="resumen-graficos-container" class="space-y-8">
                    <div id="resumen-container">
                        ${createPlaceholder('Cargando resumen...')}
                    </div>
                    <div id="graficos-container" class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div id="grafico-ausentismo-dias" class="min-h-[300px]">
                            ${createPlaceholder('Cargando gráfico...')}
                        </div>
                        <div id="grafico-ausentismo-porcentaje" class="min-h-[300px]">
                             ${createPlaceholder('Cargando gráfico...')}
                        </div>
                    </div>
                </div>
            </section>

        </div>
    `;
    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    const renderEcrLog = async (departamentos) => {
        const ecrLogContainer = document.getElementById('ecr-log-container');
        if (!ecrLogContainer) return;

        try {
            const ecrDocs = appState.collections[COLLECTIONS.ECR_FORMS] || [];

            if (ecrDocs.length === 0) {
                ecrLogContainer.innerHTML = createPlaceholder('No se encontraron registros de ECR.', 'search-x');
                lucide.createIcons();
                return;
            }

            const calcularAtraso = (fechaAbertura, fechaCierre) => {
                if (!fechaAbertura && !fechaCierre) return { dias: '', clase: '' };
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const abertura = fechaAbertura ? new Date(fechaAbertura + 'T00:00:00') : null;
                const cierre = fechaCierre ? new Date(fechaCierre + 'T00:00:00') : null;
                let diffDays;
                if (abertura && cierre) diffDays = (cierre.getTime() - abertura.getTime()) / (1000 * 3600 * 24);
                else if (abertura && !cierre) diffDays = (hoy.getTime() - abertura.getTime()) / (1000 * 3600 * 24);
                else if (!abertura && cierre) diffDays = (cierre.getTime() - hoy.getTime()) / (1000 * 3600 * 24);
                else return { dias: '', clase: '' };

                const dias = Math.floor(diffDays);
                let clase = 'atraso-bajo';
                if (dias > 30) clase = 'atraso-alto';
                else if (dias > 7) clase = 'atraso-medio';
                return { dias, clase };
            };

            let tableHTML = `
                <div class="overflow-x-auto ecr-log-table-wrapper">
                    <table class="w-full text-sm ecr-log-table">
                        <thead>
                            <tr class="bg-slate-800 text-white text-xs uppercase tracking-wider">
                                <th colspan="5" class="p-3 text-center">ECR | FECHAS</th>
                                <th class="bg-slate-400 w-2"></th>
                                <th colspan="${departamentos.length}" class="p-3 text-center">PENDENCIAS</th>
                            </tr>
                            <tr class="bg-slate-100 text-xs uppercase">
                                <th class="p-2 font-semibold">Nº</th>
                                <th class="p-2 font-semibold">F. Abertura</th>
                                <th class="p-2 font-semibold">F. Cierre</th>
                                <th class="p-2 font-semibold">Fecha</th>
                                <th class="p-2 font-semibold">Atraso (días)</th>
                                <th class="bg-slate-400 w-2"></th>
                                ${departamentos.map(d => `<th class="p-2 text-center align-middle font-semibold" style="writing-mode: vertical-rl; transform: rotate(180deg);">${d.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;

            ecrDocs.sort((a,b) => (a.id > b.id) ? 1 : -1).forEach(ecr => {
                const atraso = calcularAtraso(ecr.fecha_emision, ecr.fecha_cierre);
                tableHTML += `
                    <tr>
                        <td>${ecr.id || ''}</td>
                        <td>${ecr.fecha_emision ? new Date(ecr.fecha_emision + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td>${ecr.fecha_cierre ? new Date(ecr.fecha_cierre + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td>${ecr.fecha_realizacion_ecr ? new Date(ecr.fecha_realizacion_ecr + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td class="text-center font-bold ${atraso.clase}">${atraso.dias}</td>
                        <td class="bg-slate-400 w-2"></td>
                        ${departamentos.map(depto => {
                            const approval = ecr.approvals ? (ecr.approvals[depto.id] || { status: 'pending' }) : { status: 'pending' };
                            const status = approval.status;
                            const statusText = { 'approved': 'OK', 'rejected': 'NOK', 'pending': '' }[status] || '';
                             const statusClass = { 'approved': 'status-ok', 'rejected': 'status-nok', 'pending': 'status-empty' }[status] || 'status-empty';
                            const canApprove = appState.currentUser.role === 'admin' || appState.currentUser.sector === depto.id;
                            const buttonClass = canApprove ? 'cursor-pointer' : 'cursor-not-allowed';
                            const comment = approval.comment || 'Sin comentarios.';
                            const user = approval.user || 'N/A';
                            const date = approval.date || 'N/A';
                            const isActionable = canApprove && (status === 'pending' || status === 'rejected');
                            const title = isActionable
                                ? `Clic para ir a la sección de aprobación de ${depto.label}`
                                : `Ver detalles del ECR ${ecr.id}`;

                            return `<td class="p-0"><button title="${title}" data-action="navigate-to-ecr-details" data-ecr-id="${ecr.id}" data-depto-id="${depto.id}" data-current-status="${status}" class="w-full h-full text-center font-bold ${statusClass} cursor-pointer p-2">${statusText}</button></td>`;
                        }).join('')}
                    </tr>
                `;
            });

            tableHTML += `</tbody></table></div>`;
            ecrLogContainer.innerHTML = tableHTML;

        } catch (error) {
            console.error("Error rendering ECR log:", error);
            ecrLogContainer.innerHTML = `<p class="text-red-500">Error al cargar el registro de ECR.</p>`;
        }
    };

    renderEcrLog(DEPARTAMENTOS);

    const ecrLogContainer = document.getElementById('ecr-log-container');
    if (ecrLogContainer) {
        ecrLogContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="navigate-to-ecr-details"]');
            if (!button) return;

            const { ecrId, deptoId, currentStatus } = button.dataset;
            const currentUserSector = appState.currentUser.sector;

            const isActionable = (appState.currentUser.role === 'admin' || currentUserSector === deptoId) &&
                                 (currentStatus === 'pending' || currentStatus === 'rejected');

            if (isActionable) {
                showToast(`Navegando a la sección de aprobación para ${depto.label}...`, 'info');
                switchView('ecr_form', { ecrId, scrollToSection: deptoId });
            } else {
                showToast(`Abriendo ECR ${ecrId} en modo de solo lectura...`, 'info');
                switchView('ecr_form', { ecrId });
            }
        });
    }

    const renderAsistenciaMatriz = async (departamentos) => {
        const container = document.getElementById('asistencia-matriz-container');
        if (!container) return;

        try {
            const reuniones = appState.collections[COLLECTIONS.REUNIONES_ECR] || [];
            if (reuniones.length === 0) {
                container.innerHTML = createPlaceholder('No se encontraron reuniones para mostrar.', 'calendar-x');
                lucide.createIcons();
                return;
            }

            reuniones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            let tableHTML = `
                <div class="overflow-x-auto asistencia-matriz-wrapper">
                    <table class="w-full text-sm asistencia-matriz-table">
                        <thead>
                            <tr class="bg-slate-100 text-xs uppercase">
                                <th class="p-2 font-semibold sticky left-0 bg-slate-100 z-10">Frecuencia</th>
                                ${reuniones.map(r => `<th class="p-2 font-semibold">${new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;

            departamentos.forEach(depto => {
                tableHTML += `
                    <tr>
                        <td class="font-semibold sticky left-0 bg-white z-10">${depto.label}</td>
                        ${reuniones.map(reunion => {
                            const status = reunion.asistencia[depto.id] || '';
                            const statusClass = { 'P': 'status-p', 'A': 'status-a', 'O': 'status-o' }[status] || 'status-empty';
                            return `<td><button data-action="toggle-asistencia-status" data-reunion-id="${reunion.id}" data-depto-id="${depto.id}" class="w-full h-full text-center font-bold ${statusClass}">${status}</button></td>`;
                        }).join('')}
                    </tr>
                `;
            });

            tableHTML += `</tbody></table></div>`;
            container.innerHTML = tableHTML;

        } catch (error) {
            console.error("Error rendering Asistencia Matriz:", error);
            container.innerHTML = `<p class="text-red-500">Error al cargar la matriz de asistencia.</p>`;
        }
    };

    renderAsistenciaMatriz(DEPARTAMENTOS);

    const asistenciaMatrizContainer = document.getElementById('asistencia-matriz-container');
    if (asistenciaMatrizContainer) {
        asistenciaMatrizContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="toggle-asistencia-status"]');
            if (!button) return;

            const reunionId = button.dataset.reunionId;
            const deptoId = button.dataset.deptoId;

            if (!reunionId || !deptoId) return;

            const statusCycle = { '': 'P', 'P': 'A', 'A': 'O', 'O': '' };
            const currentStatus = button.textContent;
            const nextStatus = statusCycle[currentStatus];

            const docRef = doc(db, COLLECTIONS.REUNIONES_ECR, reunionId);
            const update = { [`asistencia.${deptoId}`]: nextStatus };

            try {
                await updateDoc(docRef, update);
                showToast('Asistencia actualizada.', 'success');
            } catch (error) {
                console.error('Error updating asistencia:', error);
                showToast('Error al actualizar la asistencia.', 'error');
            }
        });
    }

    const addReunionBtn = document.getElementById('add-reunion-btn');
    if (addReunionBtn) {
        addReunionBtn.addEventListener('click', async () => {
            const newDate = await showDatePromptModal('Agregar Reunión', 'Seleccione la fecha para la nueva reunión:');
            if (!newDate) return; // User cancelled

            const reunionId = `reunion_${newDate}`;
            const docRef = doc(db, COLLECTIONS.REUNIONES_ECR, reunionId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                showToast('Ya existe una reunión para esta fecha.', 'error');
                return;
            }

            const newReunionData = {
                id: reunionId,
                fecha: newDate,
                asistencia: DEPARTAMENTOS.reduce((acc, depto) => {
                    acc[depto.id] = ''; // Initialize all as empty
                    return acc;
                }, {})
            };

            try {
                await setDoc(docRef, newReunionData);
                showToast('Nueva reunión agregada con éxito.', 'success');
            } catch (error) {
                console.error('Error adding new reunion:', error);
                showToast('Error al agregar la nueva reunión.', 'error');
            }
        });
    }

    const renderResumenYGraficos = async (departamentos) => {
        const resumenContainer = document.getElementById('resumen-container');
        const graficoDiasContainer = document.getElementById('grafico-ausentismo-dias');
        const graficoPorcContainer = document.getElementById('grafico-ausentismo-porcentaje');

        if (!resumenContainer || !graficoDiasContainer || !graficoPorcContainer) return;

        try {
            const reuniones = appState.collections[COLLECTIONS.REUNIONES_ECR] || [];
            if (reuniones.length === 0) {
                resumenContainer.innerHTML = createPlaceholder('Sin datos para el resumen.', 'file-x');
                graficoDiasContainer.innerHTML = createPlaceholder('Sin datos para el gráfico.', 'bar-chart-big');
                graficoPorcContainer.innerHTML = createPlaceholder('Sin datos para el gráfico.', 'pie-chart');
                lucide.createIcons();
                return;
            }

            const resumenData = departamentos.map(depto => {
                let p = 0, a = 0, o = 0;
                reuniones.forEach(reunion => {
                    const status = reunion.asistencia[depto.id];
                    if (status === 'P') p++;
                    else if (status === 'A') a++;
                    else if (status === 'O') o++;
                });
                const total = p + a + o;
                const porcAusentismo = total > 0 ? (a / total) : 0;
                return { label: depto.label, p, a, o, porcAusentismo };
            });

            // Render Resumen Table
            let resumenHTML = `
                <h4 class="text-lg font-bold text-slate-700 mb-2">Resumen de Asistencia</h4>
                <div class="overflow-x-auto resumen-table-wrapper">
                    <table class="w-full text-sm resumen-table">
                        <thead class="bg-slate-50">
                            <tr class="text-xs uppercase">
                                <th>Departamento</th>
                                <th>Presente</th>
                                <th>Ausente</th>
                                <th>Opcional</th>
                                <th>Días Ausent.</th>
                                <th>% Ausent.</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            resumenData.forEach(data => {
                resumenHTML += `
                    <tr>
                        <td class="font-semibold">${data.label}</td>
                        <td>${data.p}</td>
                        <td>${data.a}</td>
                        <td>${data.o}</td>
                        <td class="font-bold">${data.a}</td>
                        <td>${(data.porcAusentismo * 100).toFixed(1)}%</td>
                    </tr>
                `;
            });
            resumenHTML += `</tbody></table></div>`;
            resumenContainer.innerHTML = resumenHTML;

            // Render Charts
            const labels = resumenData.map(d => d.label);
            const diasAusentismoData = resumenData.map(d => d.a);
            const porcAusentismoData = resumenData.map(d => d.porcAusentismo);

            graficoDiasContainer.innerHTML = '<canvas id="chart-dias-ausentismo"></canvas>';
            new Chart(document.getElementById('chart-dias-ausentismo').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Días de Ausentismo',
                        data: diasAusentismoData,
                        backgroundColor: '#f87171'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'DIAS DE AUSENTISMO A LAS REUNIONES DE ECR', font: { weight: 'bold', size: 14 } },
                        legend: { display: false }
                    },
                    scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });

            graficoPorcContainer.innerHTML = '<canvas id="chart-porc-ausentismo"></canvas>';
            new Chart(document.getElementById('chart-porc-ausentismo').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '% Total de Ausentismo',
                        data: porcAusentismoData,
                        backgroundColor: '#fbbf24'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: '%. TOTAL DE AUSENTISMO A LAS REUNIONES DE ECR', font: { weight: 'bold', size: 14 } },
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } },
                        y: { beginAtZero: true, max: 1, ticks: { callback: value => (value * 100).toFixed(0) + '%' } }
                    }
                }
            });

        } catch (error) {
            console.error("Error rendering Resumen y Gráficos:", error);
            resumenContainer.innerHTML = `<p class="text-red-500">Error al cargar el resumen.</p>`;
        }
    };

    renderResumenYGraficos(DEPARTAMENTOS);

    appState.currentViewCleanup = () => {
        // Future cleanup logic
    };
}

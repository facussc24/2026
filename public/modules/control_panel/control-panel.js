/**
 * @file Manages the main dashboard view of the Control Panel.
 */

/**
 * Renders the main Control Panel dashboard with navigation cards.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {function} deps.showInfoModal - Function to show an informational modal.
 * @param {function} deps.switchView - Function to switch views.
 * @param {object} deps.appState - The global application state.
 * @param {function} deps.seedControlPanelTutorialData - Function to seed tutorial data.
 * @param {object} newControlPanelTutorial - The tutorial module.
 */
export function renderControlPanelDashboard(deps) {
    const { dom, lucide, showInfoModal, appState, switchView, seedControlPanelTutorialData, newControlPanelTutorial } = deps;

    dom.headerActions.style.display = 'none';

    const viewHTML = `
        <div class="animate-fade-in-up">
            <div class="text-center mb-12">
                <div class="flex justify-center items-center gap-4">
                    <h2 class="text-4xl font-extrabold text-slate-800">Panel de Control Unificado</h2>
                    <button id="control-panel-help-btn" class="text-slate-400 hover:text-blue-600" title="¿Qué es esto?">
                        <i data-lucide="help-circle" class="w-8 h-8"></i>
                    </button>
                </div>
                <p class="text-lg text-slate-500 mt-2">Todos los módulos de gestión y seguimiento de Ingeniería en un solo lugar.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto" data-tutorial-id="control-panel-container">
                <a href="#" data-view="ecr_table_view" data-tutorial-id="control-panel-card-table" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-slate-700 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="table-properties" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Tabla Maestra de ECRs</h3>
                                <p class="opacity-90">Vista global de todos los ECRs.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Visualice, filtre y busque en la hoja de seguimiento corporativa de todos los Engineering Change Requests.</p>
                    </div>
                </a>
                <a href="#" data-view="indicadores_ecm_view" data-tutorial-id="control-panel-card-indicators" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-blue-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="bar-chart-3" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Indicadores de Gestión</h3>
                                <p class="opacity-90">Dashboard de Métricas (KPIs).</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Analice el rendimiento del proceso de cambios con gráficos de estado, eficiencia y plazos de ECRs y ECOs.</p>
                    </div>
                </a>
                <a href="#" data-view="ecr_seguimiento" data-tutorial-id="control-panel-card-metrics" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-emerald-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="clipboard-check" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Seguimiento de Reuniones</h3>
                                <p class="opacity-90">Asistencia y pendencias.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Registre y consulte la matriz de asistencia a reuniones de ECR y el estado de las pendencias por departamento.</p>
                    </div>
                </a>
                <a href="#" data-view="seguimiento_ecr_eco" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-purple-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="file-check-2" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Fichas de Seguimiento</h3>
                                <p class="opacity-90">Comentarios y firmas por área.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Gestione las fichas individuales de cada ECR/ECO, con comentarios y estado de firma por departamento.</p>
                    </div>
                </a>
            </div>
        </div>
    `;

    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    document.getElementById('control-panel-help-btn')?.addEventListener('click', () => {
        const helpContent = `
            <div class="space-y-4 text-slate-700">
                <p>El <strong>Panel de Control Unificado</strong> centraliza todas las herramientas para la gestión de cambios de ingeniería. Cada módulo tiene un propósito específico:</p>
                <ul class="list-disc list-inside space-y-3 pl-4">
                    <li>
                        <strong class="font-bold text-slate-800">Tabla Maestra de ECRs:</strong>
                        <p class="pl-5 text-sm">Es la vista principal para consultar y filtrar todos los ECRs de la empresa. Use esta tabla para un seguimiento detallado y para exportar informes completos.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Indicadores de Gestión:</strong>
                        <p class="pl-5 text-sm">Un dashboard con gráficos y KPIs (Indicadores Clave de Rendimiento) que miden la eficiencia del proceso de cambios, como tiempos de aprobación, ECRs abiertos vs cerrados, etc.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Seguimiento de Reuniones:</strong>
                         <p class="pl-5 text-sm">Aquí se gestiona la asistencia a las reuniones periódicas de ECR. Permite registrar presentes/ausentes y visualizar el compromiso de cada área.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Fichas de Seguimiento:</strong>
                         <p class="pl-5 text-sm">Permite gestionar los formularios individuales de cada ECR/ECO, donde cada departamento deja sus comentarios y firma digitalmente su aprobación o rechazo.</p>
                    </li>
                </ul>
                 <div class="mt-6 pt-4 border-t">
                     <p class="text-sm">Para una guía paso a paso, haga clic en el botón <strong>Ver Tutorial</strong> en el panel.</p>
                 </div>
            </div>
        `;
        showInfoModal('Ayuda del Panel de Control', helpContent);
    });

    document.getElementById('start-control-panel-tutorial-btn')?.addEventListener('click', () => {
        appState.isTutorialActive = true;
        const app = {
            switchView,
            showToast: deps.showToast,
            onTutorialEnd: () => {
                appState.isTutorialActive = false;
            },
            seedControlPanelTutorialData,
        };
        newControlPanelTutorial(app).start();
    });

    // No specific cleanup needed for this simple view
    appState.currentViewCleanup = () => {};
}

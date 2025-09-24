import { dom } from "../../../main.js";
import { showToast } from "../../shared/ui.js";
import { getFirestore, collection, getDocs, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { eventBus } from "../../../utils.js";

// Variables para almacenar las instancias de los gráficos
let ecrStatusChart = null;
let ecoProgressChart = null;

// --- FUNCIONES DE IA SIMULADAS (MOCKS) ---

async function generateEcrWithAIMock(braindump) {
    console.log("Llamando a generateEcrWithAIMock con:", braindump);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simular latencia de red
    return {
        data: {
            ecrData: {
                situacion_propuesta: `Propuesta generada por IA: ${braindump}`,
                denominacion_producto: "Componente de Ejemplo",
                cliente: "Cliente de Demostración",
            }
        }
    };
}

async function getTaskSummaryWithAIMock(prompt, context) {
    console.log("Llamando a getTaskSummaryWithAIMock con:", prompt, context);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
        data: {
            summary: `Resumen de IA para: "${prompt}".\n\nContexto analizado:\n- ${context.ecrs.length} ECRs encontrados.\n- ${context.ecos.length} ECOs encontrados.\n\nEste es un resumen simulado que indica que la IA ha procesado la información. En un entorno real, aquí se presentaría un análisis detallado.`
        }
    };
}


/**
 * Renderiza el nuevo y mejorado panel de control principal con widgets.
 * @param {object} deps - Dependencias como la instancia de la base de datos (db).
 */
export async function renderNewMainControlPanelView(deps) {
    const { db, lucide } = deps;

    dom.viewContent.innerHTML = `
        <div class="p-8 bg-gray-50 min-h-screen animate-fade-in">
            <div class="max-w-7xl mx-auto">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-gray-800">Centro de Mando de Ingeniería</h1>
                    <p class="text-gray-500 mt-1">Una visión inteligente y centralizada de todos los cambios de ingeniería.</p>
                </div>

                <!-- KPIs -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="kpi-container">
                    <!-- Los KPIs se renderizarán aquí -->
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Columna principal -->
                    <div class="lg:col-span-2 space-y-8">
                        <!-- Asistente de IA -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Asistente de IA</h2>
                            <div id="ai-assistant-content">
                                <p class="text-sm text-gray-600 mb-4">Describe un cambio para que la IA genere un ECR, o haz una pregunta sobre los procesos actuales.</p>
                                <textarea id="ai-ecr-braindump" class="w-full p-3 border rounded-md" rows="4" placeholder="Ej: Necesitamos cambiar el proveedor del tornillo M5..."></textarea>
                                <div class="flex items-center justify-between mt-4">
                                    <div class="space-x-2">
                                        <button class="ai-suggestion-btn text-sm bg-gray-200 px-3 py-1 rounded-full hover:bg-gray-300">¿Cuáles son los cuellos de botella?</button>
                                        <button class="ai-suggestion-btn text-sm bg-gray-200 px-3 py-1 rounded-full hover:bg-gray-300">Resume cambios de alta prioridad</button>
                                    </div>
                                    <button id="generate-ecr-btn" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Generar con IA</button>
                                </div>
                                <div id="ai-summary-result" class="mt-4 text-sm text-gray-700 bg-gray-100 p-4 rounded-md hidden"></div>
                            </div>
                        </div>

                        <!-- Flujo de Trabajo -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-6">Flujo de Trabajo de Cambios</h2>
                            <div id="workflow-funnel" class="flex items-center justify-between text-center">
                                <!-- Las etapas del funnel se insertarán aquí -->
                            </div>
                        </div>
                    </div>

                    <!-- Columna lateral -->
                    <div class="space-y-8">
                        <!-- Estado de ECRs -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Estado de ECRs</h2>
                            <div class="flex justify-center items-center h-64">
                                <canvas id="ecr-status-chart"></canvas>
                            </div>
                        </div>

                        <!-- Progreso de ECOs -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Progreso de ECOs</h2>
                             <div class="flex justify-center items-center h-64">
                                <canvas id="eco-progress-chart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (lucide) {
        lucide.createIcons();
    }

    // Cargar datos y renderizar todos los componentes dinámicos
    loadAndRenderDashboardData(db);
    setupAIHandlers(db);
}

async function loadAndRenderDashboardData(db) {
    // Mostrar estado de carga
    renderLoadingStates();

    try {
        const ecrQuery = query(collection(db, "ecr_forms"));
        const ecoQuery = query(collection(db, "eco_forms"));

        const [ecrSnapshot, ecoSnapshot] = await Promise.all([getDocs(ecrQuery), getDocs(ecoQuery)]);

        const ecrs = ecrSnapshot.docs.map(doc => doc.data());
        const ecos = ecoSnapshot.docs.map(doc => doc.data());

        // Calcular y renderizar KPIs
        renderKpis(ecrs, ecos);

        // Renderizar el embudo de flujo de trabajo
        renderWorkflowFunnel(ecrs, ecos);

        // Renderizar gráficos
        renderEcrStatusChart(ecrs);
        renderEcoProgressChart(ecos);

    } catch (error) {
        console.error("Error al cargar datos del panel de control:", error);
        showToast("No se pudieron cargar los datos del panel.", "error");
        // Opcional: mostrar estado de error en los widgets
    }
}

function renderLoadingStates() {
    const kpiContainer = document.getElementById('kpi-container');
    const workflowFunnel = document.getElementById('workflow-funnel');

    const kpiPlaceholder = `
        <div class="bg-white p-6 rounded-lg shadow-md animate-pulse">
            <div class="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-10 bg-gray-300 rounded w-1/2"></div>
        </div>`;
    if(kpiContainer) kpiContainer.innerHTML = Array(4).fill(kpiPlaceholder).join('');

    if(workflowFunnel) workflowFunnel.innerHTML = `<div class="text-center w-full text-gray-500">Cargando flujo de trabajo...</div>`;
}

function renderKpis(ecrs, ecos) {
    const kpiContainer = document.getElementById('kpi-container');
    if(!kpiContainer) return;

    const ecrPendientes = ecrs.filter(ecr => ecr.status === 'pending' || ecr.status === 'in-review').length;
    const ecoProgreso = ecos.filter(eco => eco.status === 'in-progress').length;
    const thirtyDaysAgo = Timestamp.now().toMillis() - (30 * 24 * 60 * 60 * 1000);
    const cambiosCompletados = ecos.filter(eco => {
        const completedDate = eco.completedAt?.toMillis();
        return eco.status === 'completed' && completedDate > thirtyDaysAgo;
    }).length;

    const approvedEcrs = ecrs.filter(ecr => ecr.status === 'approved' && ecr.fecha_emision && ecr.approvalDate);
    let avgApprovalTimeDays = 'N/A';
    if (approvedEcrs.length > 0) {
        const totalApprovalTime = approvedEcrs.reduce((acc, ecr) => {
            const emissionDate = new Date(ecr.fecha_emision).getTime();
            const approvalDate = ecr.approvalDate.toDate().getTime();
            return acc + (approvalDate - emissionDate);
        }, 0);
        avgApprovalTimeDays = (totalApprovalTime / approvedEcrs.length / (1000 * 60 * 60 * 24)).toFixed(1);
    }

    const kpis = [
        { id: 'kpi-ecr-pendientes', label: 'ECRs Pendientes', value: ecrPendientes, icon: 'file-plus-2', color: 'blue' },
        { id: 'kpi-eco-progreso', label: 'ECOs en Progreso', value: ecoProgreso, icon: 'loader', color: 'yellow' },
        { id: 'kpi-cambios-completados', label: 'Completados (30d)', value: cambiosCompletados, icon: 'check-check', color: 'green' },
        { id: 'kpi-aprobacion-media', label: 'Aprobación Media', value: `${avgApprovalTimeDays} días`, icon: 'clock-3', color: 'red' }
    ];

    kpiContainer.innerHTML = kpis.map(kpi => `
        <div class="bg-white p-6 rounded-lg shadow-md flex items-center">
            <div class="bg-${kpi.color}-100 p-4 rounded-full">
                <i data-lucide="${kpi.icon}" class="h-8 w-8 text-${kpi.color}-600"></i>
            </div>
            <div class="ml-4">
                <p class="text-sm font-medium text-gray-500">${kpi.label}</p>
                <p id="${kpi.id}" class="text-3xl font-bold text-gray-800">${kpi.value}</p>
            </div>
        </div>
    `).join('');

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderWorkflowFunnel(ecrs, ecos) {
    const funnelContainer = document.getElementById('workflow-funnel');
    if(!funnelContainer) return;

    const stages = {
        newEcrs: ecrs.filter(e => e.status === 'pending').length,
        inApproval: ecrs.filter(e => e.status === 'in-review').length,
        ecoInProgress: ecos.filter(e => e.status === 'in-progress').length,
        implemented: ecos.filter(e => e.status === 'completed').length
    };

    const funnelHtml = `
        <div class="workflow-stage">
            <div class="text-4xl font-bold text-blue-600">${stages.newEcrs}</div>
            <div class="text-sm font-semibold text-gray-600 mt-1">Nuevas ECRs</div>
        </div>
        <i data-lucide="chevron-right" class="h-10 w-10 text-gray-300"></i>
        <div class="workflow-stage">
            <div class="text-4xl font-bold text-yellow-600">${stages.inApproval}</div>
            <div class="text-sm font-semibold text-gray-600 mt-1">En Aprobación</div>
        </div>
        <i data-lucide="chevron-right" class="h-10 w-10 text-gray-300"></i>
        <div class="workflow-stage">
            <div class="text-4xl font-bold text-purple-600">${stages.ecoInProgress}</div>
            <div class="text-sm font-semibold text-gray-600 mt-1">ECOs en Progreso</div>
        </div>
        <i data-lucide="chevron-right" class="h-10 w-10 text-gray-300"></i>
        <div class="workflow-stage">
            <div class="text-4xl font-bold text-green-600">${stages.implemented}</div>
            <div class="text-sm font-semibold text-gray-600 mt-1">Implementado</div>
        </div>
    `;

    funnelContainer.innerHTML = funnelHtml;
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderEcrStatusChart(ecrs) {
    const ctx = document.getElementById('ecr-status-chart')?.getContext('2d');
    if (!ctx) return;

    const statusCounts = ecrs.reduce((acc, ecr) => {
        acc[ecr.status] = (acc[ecr.status] || 0) + 1;
        return acc;
    }, {});

    const data = {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#6B7280'],
            hoverOffset: 4
        }]
    };

    if (ecrStatusChart) {
        ecrStatusChart.destroy();
    }

    ecrStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: false
                }
            }
        },
    });
}

function renderEcoProgressChart(ecos) {
    const ctx = document.getElementById('eco-progress-chart')?.getContext('2d');
    if (!ctx) return;

    const inProgressEcos = ecos.filter(eco => eco.status === 'in-progress');

    const data = {
        labels: inProgressEcos.map(eco => eco.id || eco.ecr_no),
        datasets: [{
            label: 'Progreso de Tareas (%)',
            data: inProgressEcos.map(eco => {
                if (!eco.action_plan || eco.action_plan.length === 0) return 0;
                const totalTasks = eco.action_plan.length;
                const completedTasks = eco.action_plan.filter(task => task.completed).length;
                return (completedTasks / totalTasks) * 100;
            }),
            backgroundColor: 'rgba(99, 102, 241, 0.6)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1
        }]
    };

    if (ecoProgressChart) {
        ecoProgressChart.destroy();
    }

    ecoProgressChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function setupAIHandlers(db) {
    const generateBtn = document.getElementById('generate-ecr-btn');
    const braindumpArea = document.getElementById('ai-ecr-braindump');
    const summaryResult = document.getElementById('ai-summary-result');

    generateBtn.addEventListener('click', async () => {
        const braindump = braindumpArea.value;
        if (!braindump) {
            showToast("Por favor, describe el cambio que necesitas.", "error");
            return;
        }

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generando...';

        try {
            const result = await generateEcrWithAIMock(braindump);
            const ecrData = result.data.ecrData;
            eventBus.emit('navigate', { view: 'ecr_form', params: { aiDraftData: ecrData } });
        } catch (error) {
            console.error("Error al generar ECR con IA:", error);
            showToast("Error al generar el ECR con IA.", "error");
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generar con IA';
        }
    });

    document.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const prompt = btn.textContent;
            braindumpArea.value = prompt;
            summaryResult.classList.add('hidden');
            summaryResult.textContent = 'Obteniendo resumen de IA...';
            summaryResult.classList.remove('hidden');

            try {
                const ecrQuery = query(collection(db, "ecr_forms"), where('status', '!=', 'completed'), limit(20));
                const ecoQuery = query(collection(db, "eco_forms"), where('status', '!=', 'completed'), limit(20));

                const [ecrSnapshot, ecoSnapshot] = await Promise.all([getDocs(ecrQuery), getDocs(ecoQuery)]);
                const ecrs = ecrSnapshot.docs.map(doc => doc.data());
                const ecos = ecoSnapshot.docs.map(doc => doc.data());

                const result = await getTaskSummaryWithAIMock(prompt, { ecrs, ecos });
                summaryResult.textContent = result.data.summary;

            } catch (error) {
                console.error("Error al obtener resumen de IA:", error);
                summaryResult.textContent = 'Error al contactar al asistente de IA.';
            }
        });
    });
}
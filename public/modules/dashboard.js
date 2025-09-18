import { collection, getCountFromServer, getDocs, query, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from '../utils.js';

// Dependencies from main.js
let db;
let appState;
let dom;
let lucide;
let showToast;
let switchView;

// Task-related functions, to be injected from tasks.js
let renderTaskDashboardView;
let calculateOverdueTasksCount;
let fetchAllTasks;
let renderMyPendingTasksWidget;
let renderTasksByProjectChart;

// Module-specific state
const dashboardCharts = {};

function createKpiCard(label, value, icon, color) {
    return `
        <div class="bg-${color}-500 text-white p-6 rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300">
            <div class="flex justify-between items-start">
                <p class="text-5xl font-black">${value}</p>
                <div class="bg-white/30 p-3 rounded-xl">
                    <i data-lucide="${icon}" class="w-8 h-8"></i>
                </div>
            </div>
            <p class="mt-4 text-xl font-bold opacity-90">${label}</p>
        </div>
    `;
}

function renderDashboardKpis(kpiData, allTasks) {
    const container = document.getElementById('dashboard-kpi-container');
    if (!container) return;

    const overdueTasks = calculateOverdueTasksCount(allTasks);

    const kpis = [
        { label: 'Proyectos Activos', value: kpiData['Proyectos'] || 0, icon: 'square-stack', color: 'blue' },
        { label: 'Productos Totales', value: kpiData['Productos'] || 0, icon: 'package', color: 'indigo' },
        { label: 'Tareas Vencidas', value: overdueTasks, icon: 'siren', color: 'red' },
        { label: 'Usuarios Activos', value: kpiData['Usuarios'] || 0, icon: 'users', color: 'emerald' }
    ];

    container.innerHTML = kpis.map(kpi => createKpiCard(kpi.label, kpi.value, kpi.icon, kpi.color)).join('');
    lucide.createIcons();
}

function renderDashboardAdminPanel() {
    const container = document.getElementById('dashboard-admin-panel-container');
    if (!container) return;

    if (!appState.currentUser.isSuperAdmin) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h3 class="text-xl font-bold text-slate-800 mb-4">Panel de Administración</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="border border-yellow-300 bg-yellow-50 p-4 rounded-lg">
                    <h4 class="font-bold text-yellow-800">Poblar con Datos de Prueba</h4>
                    <p class="text-xs text-yellow-700 my-2">Borra los datos actuales (excepto usuarios) y carga un set de datos de prueba completo para ECR, ECO, productos, etc.</p>
                    <button data-action="seed-database" class="w-full bg-yellow-500 text-white px-3 py-2 rounded-md hover:bg-yellow-600 font-semibold text-sm">
                        <i data-lucide="database-zap" class="inline-block mr-1.5 h-4 w-4"></i>Poblar Base de Datos
                    </button>
                </div>
                <div class="border border-orange-300 bg-orange-50 p-4 rounded-lg">
                    <h4 class="font-bold text-orange-800">Borrar Solo Datos</h4>
                    <p class="text-xs text-orange-700 my-2">Borra todos los datos pero mantiene a los usuarios.</p>
                    <button data-action="clear-data-only" class="w-full bg-orange-500 text-white px-3 py-2 rounded-md hover:bg-orange-600 font-semibold text-sm">
                        <i data-lucide="shield-check" class="inline-block mr-1.5 h-4 w-4"></i>Ejecutar
                    </button>
                </div>
                <div class="border border-red-300 bg-red-50 p-4 rounded-lg">
                    <h4 class="font-bold text-red-800">Borrar Otros Usuarios</h4>
                    <p class="text-xs text-red-700 my-2">Elimina a todos los usuarios excepto al admin principal.</p>
                    <button data-action="clear-other-users" class="w-full bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 font-semibold text-sm">
                        <i data-lucide="user-x" class="inline-block mr-1.5 h-4 w-4"></i>Ejecutar
                    </button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function fetchDashboardKpis() {
    const kpiCollections = [
        { name: 'Productos', key: COLLECTIONS.PRODUCTOS },
        { name: 'Insumos', key: COLLECTIONS.INSUMOS },
        { name: 'Proyectos', key: COLLECTIONS.PROYECTOS },
        { name: 'Usuarios', key: COLLECTIONS.USUARIOS }
    ];
    const promises = kpiCollections.map(c => getCountFromServer(collection(db, c.key)));
    const snapshots = await Promise.all(promises);
    const kpiData = {};
    snapshots.forEach((snap, index) => {
        kpiData[kpiCollections[index].name] = snap.data().count;
    });
    return kpiData;
}

export async function runDashboardLogic() {
    const currentUser = appState.currentUser;
    dom.viewContent.innerHTML = `
        <div class="space-y-8">
            <div>
                <h1 class="text-4xl font-extrabold text-slate-800">Dashboard de Control</h1>
                <p class="text-slate-500 mt-1 text-lg">Resumen general del sistema.</p>
            </div>
            <div id="dashboard-kpi-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${[1,2,3,4].map(() => `<div class="bg-slate-200 h-28 rounded-xl animate-pulse"></div>`).join('')}
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div class="lg:col-span-3 bg-white p-6 rounded-xl shadow-lg border">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Carga de Tareas por Proyecto</h3>
                    <div id="tasks-by-project-chart-container" class="h-96"></div>
                </div>
                <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Mis Tareas Pendientes</h3>
                    <div id="dashboard-tasks-container"></div>
                </div>
            </div>
             <div id="dashboard-admin-panel-container"></div>
        </div>
    `;
    lucide.createIcons();

    // Fetch all data concurrently
    const kpiPromise = fetchDashboardKpis();
    const tasksPromise = fetchAllTasks(); // Use new function from tasks.js
    const projectsPromise = getDocs(collection(db, COLLECTIONS.PROYECTOS));

    const [kpiData, tasks, projectsSnap] = await Promise.all([kpiPromise, tasksPromise, projectsPromise]);

    const projects = projectsSnap.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

    // Render all components with the fetched data
    renderDashboardKpis(kpiData, tasks);
    renderMyPendingTasksWidget(tasks); // Use new function from tasks.js

    if (dashboardCharts.tasksByProjectChart) dashboardCharts.tasksByProjectChart.destroy();
    dashboardCharts.tasksByProjectChart = renderTasksByProjectChart(tasks, projects); // Use new function from tasks.js

    renderDashboardAdminPanel();
    lucide.createIcons();
}

export function initDashboardModule(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    showToast = dependencies.showToast;
    switchView = dependencies.switchView;

    // Injected from tasks.js
    renderTaskDashboardView = dependencies.renderTaskDashboardView;
    calculateOverdueTasksCount = dependencies.calculateOverdueTasksCount;
    fetchAllTasks = dependencies.fetchAllTasks;
    renderMyPendingTasksWidget = dependencies.renderMyPendingTasksWidget;
    renderTasksByProjectChart = dependencies.renderTasksByProjectChart;
}

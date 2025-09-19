import { subscribeToAllTasks } from './task.service.js';
import { COLLECTIONS } from '/utils.js';
import { getState, setDashboardTasks, setDashboardViewMode, resetDashboardState, addUnsubscriber, clearUnsubscribers } from './task.state.js';
import { openTaskFormModal } from './task.ui.js';

let db;
let appState;
let dom;
let lucide;

export function initDashboard(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
}

export function renderTaskDashboardView() {
    const isAdmin = appState.currentUser.role === 'admin';
    const title = isAdmin ? "Estadísticas del Equipo" : "Mis Estadísticas";
    const subtitle = isAdmin ? "Analiza, filtra y gestiona las tareas del equipo." : "Un resumen de tu carga de trabajo y progreso.";

    dom.viewContent.innerHTML = `
    <div class="flex flex-col space-y-6">
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">${title}</h2>
                <p class="text-sm text-slate-500">${subtitle}</p>
            </div>
            <button data-action="admin-back-to-board" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold flex items-center flex-shrink-0">
                <i data-lucide="arrow-left" class="mr-2 h-5 w-5"></i>
                <span>Volver al Tablero</span>
            </button>
        </div>

        <!-- Admin Filters -->
        <div id="admin-filters-container" class="bg-white p-4 rounded-xl shadow-sm border items-center gap-6 ${isAdmin ? 'flex' : 'hidden'}">
            <div class="flex items-center gap-2">
                <label for="admin-view-filter" class="text-sm font-bold text-slate-600 flex-shrink-0">Vista:</label>
                <select id="admin-view-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm">
                    <option value="all">Todas las Tareas</option>
                    <option value="my-tasks">Mis Tareas</option>
                    <option value="specific-user">Usuario específico...</option>
                </select>
            </div>
            <div id="admin-user-filter-container" class="hidden items-center gap-2">
                <label for="admin-specific-user-filter" class="text-sm font-bold text-slate-600 flex-shrink-0">Usuario:</label>
                <select id="admin-specific-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm"></select>
            </div>
        </div>

        <!-- Tabs Navigation -->
        <div id="admin-tabs-container" class="border-b border-gray-200 ${isAdmin ? 'block' : 'hidden'}">
            <nav id="admin-task-tabs" class="-mb-px flex space-x-6" aria-label="Tabs">
                <button data-tab="dashboard" class="admin-task-tab active-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm"><i data-lucide="layout-dashboard" class="mr-2"></i><span>Dashboard</span></button>
                <button data-tab="calendar" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm"><i data-lucide="calendar-days" class="mr-2"></i><span>Calendario</span></button>
                <button data-tab="table" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm"><i data-lucide="table" class="mr-2"></i><span>Tabla de Tareas</span></button>
            </nav>
        </div>

        <!-- Tab Panels Content -->
        <div id="admin-tab-content" class="animate-fade-in-up">
            <div id="tab-panel-dashboard" class="admin-tab-panel">
                 <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Estado</h3>
                        <div class="relative h-72">
                            <canvas id="status-chart"></canvas>
                        </div>
                    </div>
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Prioridad</h3>
                        <div class="relative h-72">
                            <canvas id="priority-chart"></canvas>
                        </div>
                    </div>
                    <div id="user-load-chart-wrapper" class="bg-white p-6 rounded-xl shadow-lg lg:col-span-2 ${isAdmin ? 'block' : 'hidden'}">
                        <h3 class="text-lg font-bold text-slate-800 mb-4">Carga por Usuario (Tareas Abiertas)</h3>
                        <div class="relative h-96">
                            <canvas id="user-load-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
            <div id="tab-panel-calendar" class="admin-tab-panel hidden">
                 <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div id="calendar-header" class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <div class="flex items-center gap-4">
                            <button id="prev-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-left" class="h-6 w-6"></i></button>
                            <h3 id="calendar-title" class="text-2xl font-bold text-slate-800 text-center w-48"></h3>
                            <button id="next-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-right" class="h-6 w-6"></i></button>
                            <button id="today-calendar-btn" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Hoy</button>
                        </div>
                        <div class="flex items-center gap-2">
                            <select id="calendar-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                                <option value="all">Prioridad (todas)</option>
                                <option value="high">Alta</option>
                                <option value="medium">Media</option>
                                <option value="low">Baja</option>
                            </select>
                            <div class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                                <button data-view="monthly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Mensual</button>
                                <button data-view="weekly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Semanal</button>
                            </div>
                        </div>
                    </div>
                    <div id="calendar-grid" class="mt-6"></div>
                </div>
            </div>
            <div id="tab-panel-table" class="admin-tab-panel hidden">
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div id="task-table-controls" class="flex flex-col md:flex-row gap-4 mb-4">
                        <div class="relative flex-grow"><i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i><input type="text" id="admin-task-search" placeholder="Buscar por título..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-slate-50 focus:bg-white"></div>
                        <div class="flex items-center gap-4 flex-wrap">
                            <select id="admin-task-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todos los asignados</option></select>
                            <select id="admin-task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todas las prioridades</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select>
                            <select id="admin-task-status-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white">
                                <option value="active">Activas</option>
                                <option value="all">Todos los estados</option>
                                <option value="todo">Por Hacer</option>
                                <option value="inprogress">En Progreso</option>
                                <option value="done">Completada</option>
                            </select>
                        </div>
                        <button id="add-new-task-admin-btn" class="bg-blue-600 text-white px-5 py-2 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105 flex-shrink-0"><i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea</button>
                    </div>
                    <div id="task-data-table-container" class="overflow-x-auto"><p class="text-center py-16 text-slate-500 flex items-center justify-center gap-3"><i data-lucide="loader" class="h-6 w-6 animate-spin"></i>Cargando tabla de tareas...</p></div>
                </div>
            </div>
        </div>
    </div>
    `;
    lucide.createIcons();

    if (isAdmin) {
        const tabs = document.querySelectorAll('.admin-task-tab');
        const panels = document.querySelectorAll('.admin-tab-panel');
        document.getElementById('admin-task-tabs').addEventListener('click', (e) => {
            const tabButton = e.target.closest('.admin-task-tab');
            if (!tabButton) return;
            const tabName = tabButton.dataset.tab;

            tabs.forEach(tab => tab.classList.remove('active-tab'));
            tabButton.classList.add('active-tab');

            panels.forEach(panel => {
                panel.classList.toggle('hidden', panel.id !== `tab-panel-${tabName}`);
            });

            if (tabName === 'dashboard') {
                updateAdminDashboardData(getState().dashboard.allTasks);
            }
        });
    }

    const onTasksReceived = (allTasks) => {
        setDashboardTasks(allTasks);
        setTimeout(() => {
            if (isAdmin) {
                updateAdminDashboardData(allTasks);
            } else {
                const myTasks = allTasks.filter(t => t.assigneeUid === appState.currentUser.uid || t.creatorUid === appState.currentUser.uid);
                renderAdminTaskCharts(myTasks);
            }
        }, 0);
    };

    const handleError = (error) => {
        console.error("Error fetching tasks for dashboard:", error);
        window.showToast('Error al cargar las tareas del dashboard.', 'error');
    };

    const unsubscribe = subscribeToAllTasks(onTasksReceived, handleError);
    addUnsubscriber(unsubscribe);

    if (isAdmin) {
        setupAdminTaskViewListeners();
        updateAdminDashboardData([]);
    }

    appState.currentViewCleanup = () => {
        clearUnsubscribers();
        destroyAdminTaskCharts();
        resetDashboardState();
    };
}

function updateAdminDashboardData(tasks) {
    let filteredTasks = [...tasks];
    const state = getState();
    const { viewMode } = state.dashboard;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all') {
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode);
    }

    renderAdminTaskCharts(filteredTasks);
    renderCalendar(state.dashboard.calendar.currentDate, state.dashboard.calendar.view);
    renderFilteredAdminTaskTable();
}

function destroyAdminTaskCharts() {
    const charts = getState().dashboard.charts;
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].destroy();
            charts[key] = null;
        }
    });
}

function renderAdminTaskCharts(tasks) {
    destroyAdminTaskCharts();
    renderStatusChart(tasks);
    renderPriorityChart(tasks);
    renderUserLoadChart(tasks);
}

function renderStatusChart(tasks) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const statusCounts = activeTasks.reduce((acc, task) => {
        const status = task.status || 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { todo: 0, inprogress: 0 });

    getState().dashboard.charts.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Por Hacer', 'En Progreso'],
            datasets: [{
                data: [statusCounts.todo, statusCounts.inprogress],
                backgroundColor: ['#f59e0b', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderPriorityChart(tasks) {
    const ctx = document.getElementById('priority-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const priorityCounts = activeTasks.reduce((acc, task) => {
        const priority = task.priority || 'medium';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { low: 0, medium: 0, high: 0 });

    getState().dashboard.charts.priorityChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Baja', 'Media', 'Alta'],
            datasets: [{
                data: [priorityCounts.low, priorityCounts.medium, priorityCounts.high],
                backgroundColor: ['#6b7280', '#f59e0b', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderUserLoadChart(tasks) {
    const ctx = document.getElementById('user-load-chart')?.getContext('2d');
    if (!ctx) return;

    const openTasks = tasks.filter(t => t.status !== 'done');
    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    const labels = Object.keys(userTaskCounts).map(uid => userMap.get(uid)?.name || 'No Asignado');
    const data = Object.values(userTaskCounts);

    getState().dashboard.charts.userLoadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tareas Abiertas',
                data: data,
                backgroundColor: '#3b82f6',
                borderColor: '#1d4ed8',
                borderWidth: 1,
                maxBarThickness: data.length < 3 ? 50 : undefined
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

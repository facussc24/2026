import { subscribeToAllTasks } from './task.service.js';
import { COLLECTIONS } from '../../utils.js';
import { showToast } from '../../main.js';
import { getState, setDashboardTasks, setDashboardViewMode, resetDashboardState, addUnsubscriber, clearUnsubscribers, setDashboardTableFilter } from './task.state.js';

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

export function renderTaskDashboardView(container) {
    const isAdmin = appState.currentUser.role === 'admin';

    const tableFiltersHTML = `
        <div id="dashboard-table-filters" class="flex gap-3 p-3 flex-wrap pr-4 border-t border-b mb-4">
            <button data-filter="user" class="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f0f2f4] pl-4 pr-2">
                <p class="text-[#111418] text-sm font-medium leading-normal">Usuario</p>
            </button>
            <button data-filter="status" class="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f0f2f4] pl-4 pr-2">
                <p class="text-[#111418] text-sm font-medium leading-normal">Estado</p>
            </button>
            <button data-filter="priority" class="flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-xl bg-[#f0f2f4] pl-4 pr-2">
                <p class="text-[#111418] text-sm font-medium leading-normal">Prioridad</p>
            </button>
        </div>
    `;

    const tableHTML = `
        <div class="bg-white p-6 rounded-xl shadow-lg mb-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Tabla de Tareas Recientes</h3>
            ${isAdmin ? tableFiltersHTML : ''}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr class="text-left text-xs text-slate-500 uppercase">
                            <th class="px-4 py-2">Tarea</th>
                            <th class="px-4 py-2">Usuario</th>
                            <th class="px-4 py-2">Estado</th>
                            <th class="px-4 py-2">Prioridad</th>
                            <th class="px-4 py-2">Fecha Límite</th>
                        </tr>
                    </thead>
                    <tbody id="dashboard-task-table-body" class="text-sm">
                        <!-- Rows will be injected here -->
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const chartsHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4">Carga de Tareas por Usuario</h3>
                <div class="relative flex-grow min-h-[400px]">
                    <canvas id="user-load-chart"></canvas>
                    <p id="user-load-chart-no-data" class="hidden absolute inset-0 flex items-center justify-center text-slate-500">No hay datos de carga de usuarios para mostrar.</p>
                </div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4">Estado de Tareas Abiertas</h3>
                <div class="relative flex-grow min-h-[400px]">
                    <canvas id="status-chart"></canvas>
                    <p id="status-chart-no-data" class="hidden absolute inset-0 flex items-center justify-center text-slate-500">No hay datos de estado para mostrar.</p>
                </div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Prioridad</h3>
                <div class="relative flex-grow min-h-[400px]">
                    <canvas id="priority-chart"></canvas>
                    <p id="priority-chart-no-data" class="hidden absolute inset-0 flex items-center justify-center text-slate-500">No hay datos de prioridad para mostrar.</p>
                </div>
            </div>
        </div>
    `;

    const adminViewHTML = `
        <div id="admin-filters-container" class="bg-white p-4 rounded-xl shadow-sm border items-center gap-6 mb-6 flex">
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
        <div id="dashboard-content-container" class="animate-fade-in-up mt-6">
            ${tableHTML}
            ${chartsHTML}
        </div>
    `;

    const nonAdminViewHTML = `
        <div id="dashboard-content-container" class="animate-fade-in-up mt-6">
            ${tableHTML}
            ${chartsHTML}
        </div>
    `;

    container.innerHTML = isAdmin ? adminViewHTML : nonAdminViewHTML;
    lucide.createIcons();

    const onTasksReceived = (allTasks) => {
        setDashboardTasks(allTasks);
        setTimeout(() => {
            const dashboardContentContainer = container.querySelector('#dashboard-content-container');
            updateAdminDashboardData(dashboardContentContainer || container, allTasks);
        }, 0);
    };

    const handleError = (error) => {
        console.error("Error fetching tasks for dashboard:", error);
        showToast('Error al cargar las tareas del dashboard.', 'error');
    };

    const unsubscribe = subscribeToAllTasks(onTasksReceived, handleError);
    addUnsubscriber(unsubscribe);

    if (isAdmin) {
        const dashboardContentContainer = container.querySelector('#dashboard-content-container');
        setupAdminTaskViewListeners(container, dashboardContentContainer);
        setupTableFilters(container);
        if (dashboardContentContainer) {
            updateAdminDashboardData(dashboardContentContainer, []);
        }
    } else {
        updateAdminDashboardData(container, []);
    }

    appState.currentViewCleanup = () => {
        clearUnsubscribers();
        destroyAdminTaskCharts();
        resetDashboardState();
    };
}

function setupAdminTaskViewListeners(mainContainer, dashboardContentContainer) {
    const viewFilter = mainContainer.querySelector('#admin-view-filter');
    const userFilterContainer = mainContainer.querySelector('#admin-user-filter-container');
    const userFilter = mainContainer.querySelector('#admin-specific-user-filter');

    if (userFilter) {
        const users = appState.collections.usuarios || [];
        userFilter.innerHTML = users.map(u => `<option value="${u.docId}">${u.name || u.email}</option>`).join('');
    }

    viewFilter?.addEventListener('change', (e) => {
        const selection = e.target.value;
        if (selection === 'specific-user') {
            userFilterContainer?.classList.remove('hidden');
            userFilterContainer?.classList.add('flex');
            userFilter?.dispatchEvent(new Event('change'));
        } else {
            userFilterContainer?.classList.add('hidden');
            setDashboardViewMode(selection);
            updateAdminDashboardData(dashboardContentContainer, getState().dashboard.allTasks);
        }
    });

    userFilter?.addEventListener('change', (e) => {
        const selectedUserId = e.target.value;
        setDashboardViewMode(selectedUserId);
        updateAdminDashboardData(dashboardContentContainer, getState().dashboard.allTasks);
    });
}

function setupTableFilters(container) {
    const filtersContainer = container.querySelector('#dashboard-table-filters');
    if (!filtersContainer) return;

    filtersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button || !button.dataset.filter) return;

        const filterType = button.dataset.filter;
        const state = getState().dashboard.tableFilters;

        let newValue;
        if (filterType === 'status') {
            const cycle = { 'all': 'todo', 'todo': 'inprogress', 'inprogress': 'done', 'done': 'all' };
            newValue = cycle[state.status || 'all'];
        } else if (filterType === 'priority') {
            const cycle = { 'all': 'low', 'low': 'medium', 'medium': 'high', 'high': 'all' };
            newValue = cycle[state.priority || 'all'];
        } else if (filterType === 'user') {
            const users = [{docId: 'all', name: 'Todos'}, ...appState.collections.usuarios];
            const currentIndex = users.findIndex(u => u.docId === state.user);
            newValue = users[(currentIndex + 1) % users.length].docId;
        }

        setDashboardTableFilter(filterType, newValue);
        showToast(`Filtro de tabla '${filterType}' actualizado.`, 'info');

        const dashboardContentContainer = container.querySelector('#dashboard-content-container');
        updateAdminDashboardData(dashboardContentContainer || container, getState().dashboard.allTasks);
    });
}

function updateAdminDashboardData(container, tasks) {
    let filteredTasks = [...tasks];
    const { viewMode, tableFilters } = getState().dashboard;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all' && appState.currentUser.role === 'admin') {
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode);
    } else if (appState.currentUser.role !== 'admin') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    }

    renderAdminTaskCharts(container, filteredTasks);

    let tableTasks = [...filteredTasks];
    if (tableFilters.status && tableFilters.status !== 'all') {
        tableTasks = tableTasks.filter(t => t.status === tableFilters.status);
    }
    if (tableFilters.priority && tableFilters.priority !== 'all') {
        tableTasks = tableTasks.filter(t => t.priority === tableFilters.priority);
    }
    if (tableFilters.user && tableFilters.user !== 'all') {
        tableTasks = tableTasks.filter(t => t.assigneeUid === tableFilters.user);
    }

    renderTaskTable(tableTasks);
}

function renderTaskTable(tasks) {
    const tableBody = document.getElementById('dashboard-task-table-body');
    if (!tableBody) return;

    if (tasks.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">No hay tareas para mostrar en la tabla.</td></tr>`;
        return;
    }

    const userMap = appState.collectionsById.usuarios;
    const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };
    const priorityMap = { low: 'Baja', medium: 'Media', high: 'Alta' };

    tableBody.innerHTML = tasks.slice(0, 10).map(task => {
        const user = task.assigneeUid ? userMap.get(task.assigneeUid) : null;
        const userName = user ? user.name : 'No asignado';
        const status = statusMap[task.status] || 'Desconocido';
        const priority = priorityMap[task.priority] || 'Normal';
        const dueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';

        return `
            <tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-4 py-3">${task.title}</td>
                <td class="px-4 py-3">${userName}</td>
                <td class="px-4 py-3">${status}</td>
                <td class="px-4 py-3">${priority}</td>
                <td class="px-4 py-3">${dueDate}</td>
            </tr>
        `;
    }).join('');
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

function renderAdminTaskCharts(container, tasks) {
    destroyAdminTaskCharts();

    const chartConfigs = [
        { id: 'status-chart', render: renderStatusChart },
        { id: 'priority-chart', render: renderPriorityChart },
        { id: 'user-load-chart', render: renderUserLoadChart }
    ];

    const chartInstances = [];

    chartConfigs.forEach(config => {
        const canvas = container.querySelector(`#${config.id}`);
        if (canvas) {
            const chart = config.render(container, tasks);
            if (chart) {
                chartInstances.push(chart);
            }
        }
    });

    setTimeout(() => {
        chartInstances.forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }, 150);
}

function renderStatusChart(container, tasks) {
    const canvas = container.querySelector('#status-chart');
    const noDataEl = container.querySelector('#status-chart-no-data');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !noDataEl) return null;

    const activeTasks = tasks.filter(t => t.status !== 'done');

    if (activeTasks.length === 0) {
        canvas.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        getState().dashboard.charts.statusChart = null;
        return null;
    }

    canvas.classList.remove('hidden');
    noDataEl.classList.add('hidden');

    const statusCounts = activeTasks.reduce((acc, task) => {
        const status = task.status || 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { todo: 0, inprogress: 0 });

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Por Hacer', 'En Progreso'],
            datasets: [{
                data: [statusCounts.todo, statusCounts.inprogress],
                backgroundColor: ['#f59e0b', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 4,
                hoverBorderColor: '#f3f4f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: false }
            }
        }
    });
    getState().dashboard.charts.statusChart = chart;
    return chart;
}

function renderPriorityChart(container, tasks) {
    const canvas = container.querySelector('#priority-chart');
    const noDataEl = container.querySelector('#priority-chart-no-data');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !noDataEl) return null;

    const activeTasks = tasks.filter(t => t.status !== 'done');

    if (activeTasks.length === 0) {
        canvas.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        getState().dashboard.charts.priorityChart = null;
        return null;
    }

    canvas.classList.remove('hidden');
    noDataEl.classList.add('hidden');

    const priorityCounts = activeTasks.reduce((acc, task) => {
        const priority = task.priority || 'medium';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { low: 0, medium: 0, high: 0 });

    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Baja', 'Media', 'Alta'],
            datasets: [{
                data: [priorityCounts.low, priorityCounts.medium, priorityCounts.high],
                backgroundColor: ['#6b7280', '#f59e0b', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 4,
                hoverBorderColor: '#f3f4f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
    getState().dashboard.charts.priorityChart = chart;
    return chart;
}

function renderUserLoadChart(container, tasks, retryCount = 0) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 200; // ms

    const canvas = container.querySelector('#user-load-chart');
    const noDataEl = container.querySelector('#user-load-chart-no-data');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !noDataEl) return null;

    const openTasks = tasks.filter(t => t.status !== 'done');

    if (openTasks.length === 0) {
        canvas.classList.add('hidden');
        noDataEl.classList.remove('hidden');
        getState().dashboard.charts.userLoadChart = null;
        return null;
    }

    const userMap = appState.collectionsById.usuarios;
    if (!userMap || userMap.size === 0) {
        if (retryCount < MAX_RETRIES) {
            console.warn(`User map not ready. Retrying chart render in ${RETRY_DELAY}ms... (Attempt ${retryCount + 1})`);
            setTimeout(() => renderUserLoadChart(container, tasks, retryCount + 1), RETRY_DELAY);
            return null;
        } else {
            console.error("User map failed to populate after multiple retries. Rendering chart with UIDs.");
        }
    }

    canvas.classList.remove('hidden');
    noDataEl.classList.add('hidden');

    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(userTaskCounts).map(uid => {
        if (uid === 'unassigned') return 'No Asignado';
        return userMap.get(uid)?.name || `ID: ${uid.substring(0, 5)}...`;
    });
    const data = Object.values(userTaskCounts);

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tareas Abiertas',
                data: data,
                backgroundColor: '#3b82f6',
                borderColor: '#1d4ed8',
                borderWidth: 1,
                borderRadius: 4,
                maxBarThickness: 40
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                }
            }
        }
    });
    getState().dashboard.charts.userLoadChart = chart;
    return chart;
}

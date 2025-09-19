import { subscribeToAllTasks } from './task.service.js';
import { COLLECTIONS } from '../../utils.js';
import { showToast } from '../../main.js';
import { getState, setDashboardTasks, setDashboardViewMode, resetDashboardState, addUnsubscriber, clearUnsubscribers } from './task.state.js';

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
    const title = isAdmin ? "Estadísticas del Equipo" : "Mis Estadísticas";
    const subtitle = isAdmin ? "Analiza, filtra y gestiona las tareas del equipo." : "Un resumen de tu carga de trabajo y progreso.";

    // The non-admin view is simpler and acts as a building block for the admin view's dashboard tab.
    const nonAdminViewHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <!-- User Load Chart -->
            <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4">Carga de Tareas por Usuario</h3>
                <div class="relative flex-grow min-h-[400px]">
                    <canvas id="user-load-chart"></canvas>
                    <p id="user-load-chart-no-data" class="hidden absolute inset-0 flex items-center justify-center text-slate-500">No hay datos de carga de usuarios para mostrar.</p>
                </div>
            </div>

            <!-- Status Chart -->
            <div class="bg-white p-6 rounded-xl shadow-lg flex flex-col">
                <h3 class="text-lg font-bold text-slate-800 mb-4">Estado de Tareas Abiertas</h3>
                <div class="relative flex-grow min-h-[400px]">
                    <canvas id="status-chart"></canvas>
                    <p id="status-chart-no-data" class="hidden absolute inset-0 flex items-center justify-center text-slate-500">No hay datos de estado para mostrar.</p>
                </div>
            </div>

            <!-- Priority Chart -->
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
        <!-- Admin Filters -->
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

        <!-- This is where the main content for the dashboard will go -->
        <div id="dashboard-content-container" class="animate-fade-in-up mt-6">
            ${nonAdminViewHTML}
        </div>
    `;

    // Non-admin users only see their own stats, not the tabbed interface.
    container.innerHTML = isAdmin ? adminViewHTML : nonAdminViewHTML;
    lucide.createIcons();

    const onTasksReceived = (allTasks) => {
        setDashboardTasks(allTasks);
        setTimeout(() => {
            if (isAdmin) {
                // The container for admin charts is inside the adminViewHTML
                const dashboardContentContainer = container.querySelector('#dashboard-content-container');
                if (dashboardContentContainer) {
                    updateAdminDashboardData(dashboardContentContainer, allTasks);
                }
            } else {
                // For non-admins, the main container is the chart container
                const myTasks = allTasks.filter(t => t.assigneeUid === appState.currentUser.uid || t.creatorUid === appState.currentUser.uid);
                renderAdminTaskCharts(container, myTasks);
            }
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
        if (dashboardContentContainer) {
            updateAdminDashboardData(dashboardContentContainer, []); // Initial render with empty data
        }
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

    // Populate user dropdown
    if (userFilter) {
        const users = appState.collections.usuarios || [];
        userFilter.innerHTML = users
            .map(u => `<option value="${u.docId}">${u.name || u.email}</option>`)
            .join('');
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
            if (dashboardContentContainer) {
                updateAdminDashboardData(dashboardContentContainer, getState().dashboard.allTasks);
            }
        }
    });

    userFilter?.addEventListener('change', (e) => {
        const selectedUserId = e.target.value;
        setDashboardViewMode(selectedUserId);
        if (dashboardContentContainer) {
            updateAdminDashboardData(dashboardContentContainer, getState().dashboard.allTasks);
        }
    });
}

function updateAdminDashboardData(container, tasks) {
    let filteredTasks = [...tasks];
    const { viewMode } = getState().dashboard;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all') {
        // This is the case for 'specific-user', where viewMode is the user's UID
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode);
    }

    renderAdminTaskCharts(container, filteredTasks);
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

    // Force a resize after a short delay to ensure the container is sized correctly.
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

function renderUserLoadChart(container, tasks) {
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

    canvas.classList.remove('hidden');
    noDataEl.classList.add('hidden');

    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    const labels = Object.keys(userTaskCounts).map(uid => userMap.get(uid)?.name || 'No Asignado');
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

import { subscribeToAllTasks } from './task.service.js';
import { showToast } from '../../main.js';
import { getState, setDashboardTasks, setDashboardViewMode, resetDashboardState, addUnsubscriber, clearUnsubscribers } from './task.state.js';

let db;
let appState;
let dom;

export function initDashboard(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
}

export function renderTaskDashboardView(container) {
    container.innerHTML = getDashboardHTML();

    const onTasksReceived = (allTasks) => {
        setDashboardTasks(allTasks);
        hideLoading();
        updateDashboardData(allTasks);
    };

    const handleError = (error) => {
        console.error("Error fetching tasks for dashboard:", error);
        showToast('Error al cargar las tareas del dashboard.', 'error');
        hideLoading();
    };

    showLoading();
    const unsubscribe = subscribeToAllTasks(onTasksReceived, handleError);
    addUnsubscriber(unsubscribe);

    setupViewListeners();
    updateDashboardData([]); // Initial render with empty data

    appState.currentViewCleanup = () => {
        clearUnsubscribers();
        resetDashboardState();
    };
}

function getDashboardHTML() {
    return `
    <div class="font-display bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
            <div class="loading-overlay dark:bg-card-dark/70" id="loading-overlay">
                <div class="spinner"></div>
            </div>

            <!-- Carga de Tareas por Usuario -->
            <div id="user-load-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col">
                <h3 class="text-lg font-semibold mb-6 text-text-light dark:text-text-dark flex items-center">
                    <span class="material-symbols-outlined mr-3 text-primary-DEFAULT">assignment_ind</span>Carga de Tareas por Usuario
                </h3>
                <div id="user-load-content" class="space-y-5 flex-grow"></div>
            </div>

            <!-- Estado de Tareas Abiertas -->
            <div id="status-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col">
                <h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center">
                    <span class="material-symbols-outlined mr-3 text-info">donut_small</span>Estado de Tareas Abiertas
                </h3>
                <div id="status-chart-content" class="flex justify-center items-center h-48 flex-grow"></div>
                <div id="status-legend" class="flex justify-around mt-4 pt-4 border-t border-border-light dark:border-border-dark text-sm"></div>
            </div>

            <!-- Tareas por Prioridad -->
            <div id="priority-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col">
                <h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center">
                    <span class="material-symbols-outlined mr-3 text-warning">priority_high</span>Tareas por Prioridad
                </h3>
                <div id="priority-chart-content" class="flex justify-center items-center h-48 flex-grow"></div>
                <div id="priority-legend" class="flex justify-around mt-4 pt-4 border-t border-border-light dark:border-border-dark text-sm"></div>
            </div>
        </div>
    `;
}

function setupViewListeners() {
    const viewSelect = document.getElementById('view-select');
    const filtersContainer = document.getElementById('dashboard-filters');

    if (!viewSelect || !filtersContainer) return;

    let userSelectContainer = null;

    if (appState.currentUser.role === 'admin') {
        const specificUserOption = document.createElement('option');
        specificUserOption.value = 'specific-user';
        specificUserOption.textContent = 'Usuario específico...';
        viewSelect.appendChild(specificUserOption);

        userSelectContainer = document.createElement('div');
        userSelectContainer.id = 'user-select-container';
        userSelectContainer.className = 'relative hidden';
        userSelectContainer.innerHTML = `
            <select id="user-select" class="appearance-none bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md text-sm py-2 pl-3 pr-8 focus:ring-2 focus:ring-primary-DEFAULT focus:border-primary-DEFAULT">
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary-light dark:text-text-secondary-dark">
                <span class="material-symbols-outlined !text-base">expand_more</span>
            </div>
        `;
        filtersContainer.appendChild(userSelectContainer);

        const userSelect = document.getElementById('user-select');
        const users = appState.collections.usuarios || [];
        userSelect.innerHTML = users
            .map(u => `<option value="${u.docId}">${u.name || u.email}</option>`)
            .join('');

        userSelect.addEventListener('change', (e) => {
            setDashboardViewMode(e.target.value);
            showLoading();
            updateDashboardData(getState().dashboard.allTasks);
            setTimeout(hideLoading, 500);
        });
    }

    const valueMap = {
        'Todas las Tareas': 'all',
        'Mis Tareas': 'my-tasks',
        'Tareas Asignadas': 'assigned-tasks',
        'Usuario específico...': 'specific-user'
    };

    viewSelect.addEventListener('change', (e) => {
        const selection = valueMap[e.target.value] || 'all';
        if (selection === 'specific-user') {
            if (userSelectContainer) {
                userSelectContainer.classList.remove('hidden');
                // Trigger change to set initial user
                userSelectContainer.querySelector('#user-select').dispatchEvent(new Event('change'));
            }
        } else {
            if (userSelectContainer) userSelectContainer.classList.add('hidden');
            setDashboardViewMode(selection);
            showLoading();
            updateDashboardData(getState().dashboard.allTasks);
            setTimeout(hideLoading, 500);
        }
    });
}

function updateDashboardData(tasks) {
    let filteredTasks = [...tasks];
    const { viewMode } = getState().dashboard;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode === 'assigned-tasks') {
        filteredTasks = tasks.filter(t => t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all') {
        // This handles the 'specific-user' case, where viewMode is the user's UID
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode || t.creatorUid === viewMode);
    }
    // 'all' view uses all tasks

    renderUserLoadCard(filteredTasks);
    renderStatusCard(filteredTasks);
    renderPriorityCard(filteredTasks);
}

function renderUserLoadCard(tasks) {
    const container = document.getElementById('user-load-content');
    if (!container) return;

    const openTasks = tasks.filter(t => t.status !== 'done');
    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    let content = '';

    if (Object.keys(userTaskCounts).length === 0) {
        content = '<p class="text-sm text-text-secondary-light dark:text-text-secondary-dark">No hay tareas asignadas.</p>';
    } else {
        const totalTasks = openTasks.length;
        for (const userId in userTaskCounts) {
            const count = userTaskCounts[userId];
            const percentage = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
            const userName = userId === 'unassigned' ? 'No Asignado' : (userMap.get(userId)?.name || 'Usuario Desconocido');
            const bgColor = userId === 'unassigned' ? 'bg-gray-400 dark:bg-gray-500' : 'bg-primary-DEFAULT';

            content += `
                <div class="group relative">
                    <div class="flex justify-between items-center mb-1.5">
                        <span class="text-sm text-text-secondary-light dark:text-text-secondary-dark">${userName}</span>
                        <span class="text-sm font-medium text-text-light dark:text-text-dark">${count} Tarea${count > 1 ? 's' : ''}</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div class="${bgColor} h-2.5 rounded-full progress-bar-inner" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        }
    }
    container.innerHTML = content;
}

function renderDonutChart(containerId, legendId, data, total, colors) {
    const chartContainer = document.getElementById(containerId);
    const legendContainer = document.getElementById(legendId);
    if (!chartContainer || !legendContainer) return;

    let cumulativeOffset = 0;
    const segments = data.map((item, index) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        const segment = `
            <circle class="chart-circle chart-circle-segment text-${colors[index]}"
                    cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor"
                    stroke-width="3.8" stroke-dasharray="${percentage}, 100"
                    stroke-dashoffset="-${cumulativeOffset}">
            </circle>`;
        cumulativeOffset += percentage;
        return segment;
    }).join('');

    chartContainer.innerHTML = `
        <div class="relative w-40 h-40 chart-container">
            <svg class="w-full h-full" viewBox="0 0 36 36">
                <circle class="text-gray-200 dark:text-gray-700" cx="18" cy="18" fill="none" r="15.9155" stroke="currentColor" stroke-width="3.8"></circle>
                ${segments}
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-4xl font-bold text-text-light dark:text-text-dark">${total}</span>
                <span class="text-sm text-text-secondary-light dark:text-text-secondary-dark">Abiertas</span>
            </div>
        </div>
    `;

    legendContainer.innerHTML = data.map((item, index) => `
        <div class="flex flex-col items-center">
            <div class="flex items-center">
                <span class="w-3 h-3 rounded-full bg-${colors[index]} mr-2"></span>
                <span class="text-text-secondary-light dark:text-text-secondary-dark">${item.label}</span>
            </div>
            <span class="font-bold text-lg text-text-light dark:text-text-dark mt-1">${item.count}</span>
        </div>
    `).join('');
}

function renderStatusCard(tasks) {
    const openTasks = tasks.filter(t => t.status !== 'done');
    const statusCounts = openTasks.reduce((acc, task) => {
        const status = task.status === 'inprogress' ? 'inprogress' : 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { todo: 0, inprogress: 0 });

    const data = [
        { label: 'Por Hacer', count: statusCounts.todo, color: 'warning' },
        { label: 'En Progreso', count: statusCounts.inprogress, color: 'info' }
    ];

    renderDonutChart('status-chart-content', 'status-legend', data, openTasks.length, ['warning', 'info']);
}

function renderPriorityCard(tasks) {
    const openTasks = tasks.filter(t => t.status !== 'done');
    const priorityCounts = openTasks.reduce((acc, task) => {
        const priority = task.priority || 'medium';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { low: 0, medium: 0, high: 0 });

    const data = [
        { label: 'Alta', count: priorityCounts.high, color: 'danger' },
        { label: 'Media', count: priorityCounts.medium, color: 'warning' },
        { label: 'Baja', count: priorityCounts.low, color: 'success' }
    ];

    renderDonutChart('priority-chart-content', 'priority-legend', data, openTasks.length, ['danger', 'warning', 'success']);
}

function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

import { subscribeToPaginatedTasks, subscribeToAllTasks } from './task.service.js';
import { showToast } from '../../main.js';
import { getState, setDashboardTasks, addUnsubscriber, clearUnsubscribers, resetDashboardState } from './task.state.js';
import { renderTasksTable, renderPaginationControls, renderTaskTableFilters, showTableLoading, hideTableLoading } from './task.ui.js'; // I will create these in the next step

let db;
let appState;
let dom;
let lucide;

// State for the dashboard view
let dashboardState = {
    taskSubscription: null,
    chartsSubscription: null,
    filters: {
        searchTerm: '',
        user: 'all',
        status: 'all',
        priority: 'all'
    },
    pagination: {
        lastVisible: null,
        currentPage: 1,
        isLastPage: false
    }
};

export function initDashboard(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
}

export function renderTaskDashboardView(container) {
    // Clean up previous view subscriptions before rendering
    if (appState.currentViewCleanup) {
        appState.currentViewCleanup();
    }

    container.innerHTML = getTaskDashboardLayoutHTML();
    lucide.createIcons();

    const titleEl = container.querySelector('#task-list-title');
    titleEl.textContent = appState.currentUser.role === 'admin' ? 'Tareas del equipo' : 'Lista de tareas';

    renderTaskTableFilters(container.querySelector('#task-filters-container'), appState.currentUser, appState.collections.usuarios);
    lucide.createIcons();

    setupEventListeners(container);

    fetchAndRenderTasks(true); // Initial fetch

    // The old charts will now have their own subscription logic, separate from the paginated list
    const chartsContainer = container.querySelector('#old-charts-container');
    setupCharts(chartsContainer);

    appState.currentViewCleanup = () => {
        if (dashboardState.taskSubscription) dashboardState.taskSubscription();
        if (dashboardState.chartsSubscription) dashboardState.chartsSubscription();
        // Reset state for next time
        dashboardState = {
            taskSubscription: null,
            chartsSubscription: null,
            filters: { searchTerm: '', user: 'all', status: 'all', priority: 'all' },
            pagination: { lastVisible: null, currentPage: 1, isLastPage: false, pageHistory: [null] }
        };
    };
}

function getTaskDashboardLayoutHTML() {
    return `
    <div class="flex flex-col flex-1 w-full mx-auto">
        <!-- Header -->
        <div class="flex flex-wrap justify-between items-center gap-3 p-4">
            <div class="flex flex-col gap-2">
                <h2 id="task-list-title" class="text-text-light dark:text-text-dark tracking-light text-2xl md:text-3xl font-bold leading-tight"></h2>
                <p class="text-text-secondary-light dark:text-text-secondary-dark text-sm font-normal leading-normal">
                  Visualiza y gestiona todas las tareas. Utiliza los filtros para encontrar tareas específicas.
                </p>
            </div>
        </div>

        <!-- Filters and Search -->
        <div class="flex flex-col gap-4 p-4">
            <div id="task-filters-container" class="flex gap-2 flex-wrap">
                <!-- Filter buttons will be injected here by renderTaskTableFilters -->
            </div>
            <div class="w-full">
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary-light dark:text-text-secondary-dark"></i>
                    <input id="task-search-input" type="text" placeholder="Buscar tareas por nombre, proyecto o usuario..." class="input w-full pl-12 pr-4 py-3">
                </div>
            </div>
        </div>

        <!-- Task Table -->
        <div id="tasks-table-container" class="px-4 py-3">
            <!-- Table will be rendered here by renderTasksTable -->
        </div>

        <!-- Pagination -->
        <div id="pagination-container" class="flex items-center justify-center p-4">
            <!-- Pagination controls will be rendered here by renderPaginationControls -->
        </div>

        <!-- Divider -->
        <div class="px-4 pt-8 pb-4">
            <div class="border-t border-border-light dark:border-border-dark"></div>
        </div>

        <!-- Existing Charts Section -->
        <div class="p-4">
            <h2 class="text-text-light dark:text-text-dark text-xl md:text-2xl font-bold leading-tight">Resumen del rendimiento del equipo</h2>
            <div id="old-charts-container" class="grid grid-cols-1 lg:grid-cols-3 gap-6 relative pt-6">
                <!-- The old charts HTML will be injected here -->
            </div>
        </div>
    </div>
    `;
}

function setupEventListeners(container) {
    const searchInput = container.querySelector('#task-search-input');
    const filtersContainer = container.querySelector('#task-filters-container');
    const paginationContainer = container.querySelector('#pagination-container');

    // Debounced search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            dashboardState.filters.searchTerm = e.target.value;
            fetchAndRenderTasks(true); // Reset to first page
        }, 500);
    });

    const handleFilterChange = (filterType, filterValue) => {
        if (dashboardState.filters[filterType] !== filterValue) {
            dashboardState.filters[filterType] = filterValue;
            fetchAndRenderTasks(true);
        }
    };

    // Listener for button-based filters
    filtersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-filter-type]');
        if (!button) return;

        const { filterType, filterValue } = button.dataset;

        // Update active button style
        const group = button.parentElement;
        const currentActive = group.querySelector('.btn-white');
        if (currentActive) {
            currentActive.classList.replace('btn-white', 'btn-ghost');
        }
        button.classList.replace('btn-ghost', 'btn-white');

        handleFilterChange(filterType, filterValue);
    });

    // Listener for select-based filters (from custom event)
    filtersContainer.addEventListener('filterchange', (e) => {
        const { filterType, filterValue } = e.detail;
        handleFilterChange(filterType, filterValue);
    });


    // Pagination
    paginationContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-page]');
        if (!button) return;
        const page = button.dataset.page;
        if (page === 'next') {
            dashboardState.pagination.currentPage++;
            fetchAndRenderTasks();
        }
    });

    // Add new task button is removed
}


function fetchAndRenderTasks(resetPagination = false) {
    if (dashboardState.taskSubscription) {
        dashboardState.taskSubscription();
    }

    if (resetPagination) {
        dashboardState.pagination.lastVisible = null;
        dashboardState.pagination.currentPage = 1;
    }

    const tableContainer = document.getElementById('tasks-table-container');
    showTableLoading(tableContainer);

    const paginationConfig = {
        lastVisible: dashboardState.pagination.lastVisible,
        pageSize: 10
    };

    dashboardState.taskSubscription = subscribeToPaginatedTasks(dashboardState.filters, paginationConfig,
        ({ tasks, lastVisible: newLastVisible, isLastPage }) => {
            hideTableLoading();
            renderTasksTable(tableContainer, tasks, appState.collectionsById.usuarios);

            dashboardState.pagination.lastVisible = newLastVisible; // This was the critical missing piece
            dashboardState.pagination.isLastPage = isLastPage;

            renderPaginationControls(document.getElementById('pagination-container'), dashboardState.pagination.currentPage, isLastPage);
        },
        (error) => {
            hideTableLoading();
            showToast('Error al cargar las tareas.', 'error');
            console.error(error);
        }
    );
}

// Logic for the old charts, mostly unmodified but placed in a separate function
function setupCharts(container) {
    container.innerHTML = `
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
    `;

    const onTasksReceived = (allTasks) => {
        setDashboardTasks(allTasks); // This is from the original implementation
        renderUserLoadCard(allTasks);
        renderStatusCard(allTasks);
        renderPriorityCard(allTasks);
    };

    const handleError = (error) => {
        console.error("Error fetching tasks for charts:", error);
        showToast('Error al cargar los gráficos.', 'error');
    };

    // Subscribe to all tasks just for the charts
    dashboardState.chartsSubscription = subscribeToAllTasks(onTasksReceived, handleError);
}

// Chart rendering functions from original file, slightly adapted to not rely on document queries as much
function renderUserLoadCard(tasks) {
    const container = document.getElementById('user-load-card');
    if (!container) return;

    const openTasks = tasks.filter(t => t.status !== 'done');
    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    let content = `
        <h3 class="text-lg font-semibold mb-6 text-text-light dark:text-text-dark flex items-center">
            <span class="material-symbols-outlined mr-3 text-primary-DEFAULT">assignment_ind</span>Carga de Tareas por Usuario
        </h3>
        <div class="space-y-5 flex-grow">
    `;

    if (Object.keys(userTaskCounts).length === 0) {
        content += '<p class="text-sm text-text-secondary-light dark:text-text-secondary-dark">No hay tareas asignadas.</p>';
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
    content += '</div>';
    container.innerHTML = content;
}

function renderDonutChart(container, data, total, colors, title) {
    if (!container) return;

    let cumulativeOffset = 0;
    const segments = data.map((item, index) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        const segment = `<circle class="chart-circle chart-circle-segment text-${colors[index]}" cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" stroke-width="3.8" stroke-dasharray="${percentage}, 100" stroke-dashoffset="-${cumulativeOffset}"></circle>`;
        cumulativeOffset += percentage;
        return segment;
    }).join('');

    const legend = data.map((item, index) => `
        <div class="flex flex-col items-center">
            <div class="flex items-center">
                <span class="w-3 h-3 rounded-full bg-${colors[index]} mr-2"></span>
                <span class="text-text-secondary-light dark:text-text-secondary-dark">${item.label}</span>
            </div>
            <span class="font-bold text-lg text-text-light dark:text-text-dark mt-1">${item.count}</span>
        </div>
    `).join('');

    container.innerHTML = `
        ${title}
        <div class="flex justify-center items-center h-48 flex-grow">
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
        </div>
        <div class="flex justify-around mt-4 pt-4 border-t border-border-light dark:border-border-dark text-sm">${legend}</div>
    `;
}

function renderStatusCard(tasks) {
    const container = document.getElementById('status-card');
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
    const title = `<h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center"><span class="material-symbols-outlined mr-3 text-info">donut_small</span>Estado de Tareas Abiertas</h3>`;
    renderDonutChart(container, data, openTasks.length, ['warning', 'info'], title);
}

function renderPriorityCard(tasks) {
    const container = document.getElementById('priority-card');
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
    const title = `<h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center"><span class="material-symbols-outlined mr-3 text-warning">priority_high</span>Tareas por Prioridad</h3>`;
    renderDonutChart(container, data, openTasks.length, ['danger', 'warning', 'success'], title);
}

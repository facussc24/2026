import { subscribeToAllTasks } from './task.service.js';
import { showToast } from '../../main.js';
import { getState, setDashboardTasks, resetDashboardState, setDashboardTableFilter, setDashboardTablePage } from './task.state.js';
import { renderTasksTable, renderPaginationControls, renderTaskTableFilters, showTableLoading, hideTableLoading } from './task.ui.js';
import { getDashboardLayoutHTML } from './task.templates.js';

let db;
let appState;
let dom;
let lucide;
let taskSubscription = null;
let chartsSubscription = null;


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

    resetDashboardState();
    container.innerHTML = getDashboardLayoutHTML();
    lucide.createIcons();

    const titleEl = container.querySelector('#task-list-title');
    titleEl.textContent = appState.currentUser.role === 'admin' ? 'Tareas del equipo' : 'Lista de tareas';

    renderTaskTableFilters(container.querySelector('#task-filters-container'), appState.currentUser, appState.collections.usuarios);
    lucide.createIcons();

    setupEventListeners(container);

    fetchAndRenderAll();

    appState.currentViewCleanup = () => {
        if (taskSubscription) taskSubscription();
        if (chartsSubscription) chartsSubscription();
        resetDashboardState();
    };
}

function setupEventListeners(container) {
    const searchInput = container.querySelector('#task-search-input');
    const filtersContainer = container.querySelector('#task-filters-container');
    const paginationContainer = container.querySelector('#pagination-container');
    const exportButton = container.querySelector('#export-tasks-btn');

    if (exportButton) {
        exportButton.addEventListener('click', () => handleExportTasks(exportButton));
    }

    // Debounced search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            setDashboardTableFilter('searchTerm', e.target.value);
            setDashboardTablePage(1);
            renderFilteredContent();
        }, 500);
    });

    const handleFilterChange = (filterType, filterValue) => {
        const state = getState().dashboard.tableFilters;
        if (state[filterType] !== filterValue) {
            setDashboardTableFilter(filterType, filterValue);
            setDashboardTablePage(1);
            renderFilteredContent();
        }
    };

    // Listener for button-based filters
    filtersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-filter-type]');
        if (!button) return;

        const { filterType, filterValue } = button.dataset;

        // Update active button style
        const group = button.parentElement;
        const currentActive = group.querySelector('.btn-primary');
        if (currentActive) {
            currentActive.classList.replace('btn-primary', 'btn-ghost');
            currentActive.classList.remove('text-white');
        }
        button.classList.replace('btn-ghost', 'btn-primary');
        button.classList.add('text-white');

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
        if (!button || button.disabled) return;
        const pageAction = button.dataset.page;
        const state = getState().dashboard.tablePagination;

        if (pageAction === 'next' && !state.isLastPage) {
            setDashboardTablePage(state.currentPage + 1);
            renderFilteredContent();
        } else if (pageAction === 'prev' && state.currentPage > 1) {
            setDashboardTablePage(state.currentPage - 1);
            renderFilteredContent();
        }
    });
}

function applyFilters(tasks) {
    const { tableFilters } = getState().dashboard;
    const { searchTerm, user, status, priority } = tableFilters;
    const lowercasedFilter = searchTerm.toLowerCase();
    const userMap = appState.collectionsById.usuarios;

    return tasks.filter(task => {
        const matchesUser = user === 'all' || task.assigneeUid === user;
        const matchesStatus = status === 'all' || task.status === status;
        const matchesPriority = priority === 'all' || task.priority === priority;

        const assignee = userMap.get(task.assigneeUid);
        const assigneeName = assignee ? assignee.name.toLowerCase() : '';

        const matchesSearch = !lowercasedFilter ||
            task.title.toLowerCase().includes(lowercasedFilter) ||
            (task.proyecto && task.proyecto.toLowerCase().includes(lowercasedFilter)) ||
            (assigneeName && assigneeName.includes(lowercasedFilter));

        return matchesUser && matchesStatus && matchesPriority && matchesSearch;
    });
}

function handleExportTasks(button) {
    if (!button) return;

    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Generando...</span>`;
    lucide.createIcons();

    try {
        const { allTasks } = getState().dashboard;
        const filteredTasks = applyFilters(allTasks);

        if (filteredTasks.length === 0) {
            showToast('No hay tareas para exportar con los filtros actuales.', 'info');
            return;
        }

        const csvContent = buildTasksCsv(filteredTasks);
        triggerCsvDownload(csvContent);

        const taskWord = filteredTasks.length === 1 ? 'tarea' : 'tareas';
        showToast(`Se exportaron ${filteredTasks.length} ${taskWord}.`, 'success');
    } catch (error) {
        console.error('Error exporting tasks:', error);
        showToast('No se pudo exportar las tareas. Intente nuevamente.', 'error');
    } finally {
        button.disabled = false;
        button.innerHTML = originalHTML;
        lucide.createIcons();
    }
}

function buildTasksCsv(tasks) {
    const headers = [
        'Título',
        'Descripción',
        'Proyecto',
        'Responsable',
        'Creada por',
        'Estado',
        'Prioridad',
        'Fecha de inicio',
        'Fecha de vencimiento',
        'Subtareas completadas',
        'Progreso (%)',
        'Es pública',
        'Creada el',
        'Actualizada el'
    ];

    const userMap = appState.collectionsById.usuarios;
    const rows = [headers.map(formatCsvField).join(',')];

    tasks.forEach(task => {
        const assignee = userMap.get(task.assigneeUid);
        const creator = userMap.get(task.creatorUid);
        const assigneeName = assignee ? assignee.name : 'No asignado';
        const creatorName = creator ? creator.name : 'No disponible';
        const statusLabel = STATUS_LABELS[task.status] || STATUS_LABELS.todo;
        const priorityLabel = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium;
        const startDate = formatDateForCsv(task.startDate);
        const dueDate = formatDateForCsv(task.dueDate);
        const createdAt = formatDateForCsv(task.createdAt, { includeTime: true });
        const updatedAt = formatDateForCsv(task.updatedAt, { includeTime: true });

        let progress = 0;
        let subtasksSummary = 'Sin subtareas';
        if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
            const completed = task.subtasks.filter(st => st.completed).length;
            progress = Math.round((completed / task.subtasks.length) * 100);
            subtasksSummary = `${completed}/${task.subtasks.length}`;
        } else if (task.status === 'done') {
            progress = 100;
        }

        const rowValues = [
            task.title || '',
            task.description || '',
            task.proyecto || 'N/A',
            assigneeName,
            creatorName,
            statusLabel,
            priorityLabel,
            startDate,
            dueDate,
            subtasksSummary,
            progress,
            task.isPublic ? 'Sí' : 'No',
            createdAt,
            updatedAt
        ];

        rows.push(rowValues.map(formatCsvField).join(','));
    });

    return `\ufeff${rows.join('\r\n')}`;
}

function triggerCsvDownload(csvContent) {
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const urlCreator = (typeof window !== 'undefined' && (window.URL || window.webkitURL)) || URL;

    if (!urlCreator || typeof urlCreator.createObjectURL !== 'function') {
        throw new Error('El navegador no soporta la descarga de archivos.');
    }

    const url = urlCreator.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `tareas_${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    urlCreator.revokeObjectURL(url);
}

function formatCsvField(value) {
    if (value === null || value === undefined) {
        return '""';
    }
    const stringValue = String(value).replace(/"/g, '""');
    return `"${stringValue}"`;
}

function formatDateForCsv(value, options = {}) {
    const date = parseDateValue(value);
    if (!date) return '';

    const { includeTime = false } = options;
    if (includeTime) {
        return date.toLocaleString('es-AR');
    }
    return date.toLocaleDateString('es-AR');
}

function parseDateValue(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'string') {
        const asDateTime = new Date(value);
        if (!Number.isNaN(asDateTime.getTime())) {
            return asDateTime;
        }

        const asDate = new Date(`${value}T00:00:00`);
        if (!Number.isNaN(asDate.getTime())) {
            return asDate;
        }

        return null;
    }

    if (typeof value.toDate === 'function') {
        return value.toDate();
    }

    return null;
}

const STATUS_LABELS = {
    todo: 'Pendiente',
    inprogress: 'En progreso',
    done: 'Completado'
};

const PRIORITY_LABELS = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baja'
};

function renderFilteredContent() {
    const { allTasks, tablePagination } = getState().dashboard;
    const { currentPage, pageSize } = tablePagination;

    const filteredTasks = applyFilters(allTasks);

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const paginatedTasks = filteredTasks.slice(start, end);
    const isLastPage = end >= filteredTasks.length;

    const tableContainer = document.getElementById('tasks-table-container');
    hideTableLoading();
    renderTasksTable(tableContainer, paginatedTasks, appState.collectionsById.usuarios);
    renderPaginationControls(document.getElementById('pagination-container'), currentPage, isLastPage);
}


function fetchAndRenderAll() {
    if (taskSubscription) taskSubscription();
    if (chartsSubscription) chartsSubscription();

    const tableContainer = document.getElementById('tasks-table-container');
    showTableLoading(tableContainer);

    chartsSubscription = subscribeToAllTasks((allTasks) => {
        setDashboardTasks(allTasks);
        renderFilteredContent();

        // Render charts
        const chartsContainer = document.getElementById('old-charts-container');
        chartsContainer.innerHTML = `
            <div id="user-load-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col"></div>
            <div id="status-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col"></div>
            <div id="priority-card" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark flex flex-col"></div>
        `;
        renderUserLoadCard(allTasks);
        renderStatusCard(allTasks);
        renderPriorityCard(allTasks);
    }, (error) => {
        hideTableLoading();
        showToast('Error al cargar las tareas.', 'error');
        console.error(error);
    });
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
            <i data-lucide="contact" class="w-5 h-5 mr-3 text-primary-DEFAULT"></i>Carga de Tareas por Usuario
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
    const title = `<h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center"><i data-lucide="pie-chart" class="w-5 h-5 mr-3 text-info"></i>Estado de Tareas Abiertas</h3>`;
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
    const title = `<h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark flex items-center"><i data-lucide="alert-triangle" class="w-5 h-5 mr-3 text-warning"></i>Tareas por Prioridad</h3>`;
    renderDonutChart(container, data, openTasks.length, ['danger', 'warning', 'success'], title);
}

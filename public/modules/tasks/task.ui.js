import { checkUserPermission, showConfirmationModal, showToast } from '../../main.js';
import { getState } from './task.state.js';
import { deleteTask, loadTelegramConfig, saveTelegramConfig, sendTestTelegram } from './task.service.js';
import { initTasksSortable } from './task.kanban.js';
import { getTaskCardHTML, getSubtaskHTML, getAdminUserListHTML, getTasksTableHTML, getPaginationControlsHTML, getTaskTableFiltersHTML, getMyPendingTasksWidgetHTML, getTelegramConfigHTML } from './task.templates.js';
import { openTaskFormModal } from './task.modal.js';

let appState;
let dom;
let lucide;
let db; // Needed for comments

export function initTaskUI(dependencies) {
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    db = dependencies.db;
}

function createTaskCard(task) {
    const assignee = (appState.collections.usuarios || []).find(u => u.docId === task.assigneeUid);
    return getTaskCardHTML(task, assignee, checkUserPermission);
}

function renderSubtask(subtask) {
    return getSubtaskHTML(subtask);
}


export function renderTaskFilters(container) {
    const state = getState();
    const filters = [
        { key: 'engineering', label: 'Ingeniería' },
        { key: 'personal', label: 'Mis Tareas' }
    ];
    if (appState.currentUser.role === 'admin') {
        filters.push({ key: 'supervision', label: 'Supervisión' });
        filters.push({ key: 'all', label: 'Todas' });
    }
    const filterContainer = container.querySelector('#task-filters');
    if (filterContainer) {
        filterContainer.innerHTML = filters.map(f => `
            <button data-filter="${f.key}" class="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${state.kanban.activeFilter === f.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-300/50'}">
                ${f.label}
            </button>
        `).join('');
    }
}

export function renderTasks(tasks, container) {
    const getEmptyColumnHTML = (status) => {
        const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };
        return `
            <div class="p-4 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-lg h-full flex flex-col justify-center items-center no-drag animate-fade-in">
                <i data-lucide="inbox" class="h-10 w-10 mx-auto text-slate-400"></i>
                <h4 class="mt-4 font-semibold text-slate-600">Columna Vacía</h4>
                <p class="text-sm mt-1 mb-4">No hay tareas en estado "${statusMap[status]}".</p>
                <button data-action="add-task-to-column" data-status="${status}" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm py-1.5 px-3 rounded-full mx-auto flex items-center">
                    <i data-lucide="plus" class="mr-1.5 h-4 w-4"></i>Añadir Tarea
                </button>
            </div>
        `;
    };

    const tasksByStatus = { todo: [], inprogress: [], done: [] };
    tasks.forEach(task => {
        tasksByStatus[task.status || 'todo'].push(task);
    });

    container.querySelectorAll('.task-column').forEach(columnEl => {
        const status = columnEl.dataset.status;
        const taskListEl = columnEl.querySelector('.task-list');
        const columnTasks = tasksByStatus[status];

        if (columnTasks.length === 0) {
            taskListEl.innerHTML = getEmptyColumnHTML(status);
        } else {
            taskListEl.innerHTML = '';
            columnTasks.forEach(task => {
                const taskCardHTML = createTaskCard(task);
                const template = document.createElement('template');
                template.innerHTML = taskCardHTML.trim();
                const cardNode = template.content.firstChild;
                cardNode.addEventListener('click', (e) => {
                    if (e.target.closest('.task-actions')) return;
                    openTaskFormModal(task);
                });
                taskListEl.appendChild(cardNode);
            });
        }
    });

    initTasksSortable(container);
    lucide.createIcons();
}



export function renderTasksByProjectChart(tasks) {
    const container = document.getElementById('tasks-by-project-chart-container');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">No hay tareas para mostrar.</p>';
        return;
    }

    const tasksByProject = tasks.reduce((acc, task) => {
        const projectName = task.isPublic ? 'Ingeniería' : 'Personal';
        acc[projectName] = (acc[projectName] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(tasksByProject);
    const data = Object.values(tasksByProject);

    container.innerHTML = '<canvas id="tasks-by-project-chart"></canvas>';
    const ctx = document.getElementById('tasks-by-project-chart').getContext('2d');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nº de Tareas',
                data: data,
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(245, 158, 11, 0.7)'
                ],
                borderColor: [
                    'rgba(59, 130, 246, 1)',
                    'rgba(245, 158, 11, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

export function openTelegramConfigModal() {
    const modalId = 'telegram-config-modal';
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
                <div class="flex justify-between items-center p-5 border-b border-slate-200">
                    <h3 class="text-xl font-bold text-slate-800">Configuración de Telegram</h3>
                    <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 overflow-y-auto">
                    ${getTelegramConfigHTML()}
                </div>
            </div>
        </div>
    `;

    dom.modalContainer.innerHTML = modalHTML;
    const modalElement = document.getElementById(modalId);

    // The getTelegramConfigHTML includes a collapsible container, we should expand it by default in the modal view.
    const collapsibleBody = modalElement.querySelector('#telegram-config-body');
    const collapsibleChevron = modalElement.querySelector('#telegram-config-chevron');
    if(collapsibleBody) collapsibleBody.style.display = 'block';
    if(collapsibleChevron) collapsibleChevron.style.display = 'none'; // Hide chevron as it's not needed

    // Setup event listeners
    loadTelegramConfig(modalElement);
    modalElement.querySelector('#save-telegram-config-btn').addEventListener('click', () => saveTelegramConfig(modalElement));
    modalElement.querySelector('#send-test-telegram-btn').addEventListener('click', () => sendTestTelegram(modalElement));
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());

    lucide.createIcons();
}

export function renderAdminUserList(users, container) {
    container.innerHTML = getAdminUserListHTML(users);
    lucide.createIcons();
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const seconds = Math.floor((now - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `hace ${Math.floor(interval)} años`;
    interval = seconds / 2592000;
    if (interval > 1) return `hace ${Math.floor(interval)} meses`;
    interval = seconds / 86400;
    if (interval > 1) return `hace ${Math.floor(interval)} días`;
    interval = seconds / 3600;
    if (interval > 1) return `hace ${Math.floor(interval)} horas`;
    interval = seconds / 60;
    if (interval > 1) return `hace ${Math.floor(interval)} minutos`;
    return `hace ${Math.floor(seconds)} segundos`;
}

export function showTableLoading(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="flex items-center justify-center p-10">
            <i data-lucide="loader" class="w-8 h-8 animate-spin text-primary-DEFAULT"></i>
        </div>
    `;
    if (lucide) {
        lucide.createIcons();
    }
}

export function hideTableLoading() {
    // The container is cleared by the rendering function, so this can be a no-op
}

export function renderTasksTable(container, tasks, userMap) {
    if (!container) return;

    container.innerHTML = getTasksTableHTML(tasks, userMap);
    if (lucide) {
        lucide.createIcons();
    }

    container.querySelectorAll('tr[data-task-id]').forEach(row => {
        row.addEventListener('click', () => {
            const taskId = row.dataset.taskId;
            const task = tasks.find(t => t.docId === taskId);
            if(task) {
                openTaskFormModal(task);
            }
        });
    });
}

export function renderPaginationControls(container, currentPage, isLastPage) {
    if (!container) return;

    container.innerHTML = getPaginationControlsHTML(currentPage, isLastPage);
    if (lucide) {
        lucide.createIcons();
    }
}

export function renderTaskTableFilters(container, currentUser, users) {
    if (!container) return;

    container.innerHTML = getTaskTableFiltersHTML(currentUser, users);

    const userSelect = container.querySelector('#user-filter-select');
    if (userSelect) {
        userSelect.addEventListener('change', (e) => {
            const dashboardFilters = document.getElementById('task-filters-container');
            if (dashboardFilters) {
                const fakeButton = document.createElement('button');
                fakeButton.dataset.filterType = 'user';
                fakeButton.dataset.filterValue = e.target.value;

                const customEvent = new CustomEvent('filterchange', {
                    detail: { filterType: 'user', filterValue: e.target.value },
                    bubbles: true
                });
                dashboardFilters.dispatchEvent(customEvent);
            }
        });
    }
}


export function renderMyPendingTasksWidget(tasks) {
    const container = document.getElementById('my-pending-tasks-widget');
    const countEl = document.getElementById('my-pending-tasks-count');

    if (!container || !countEl) {
        return;
    }

    countEl.textContent = tasks.length;

    container.innerHTML = getMyPendingTasksWidgetHTML(tasks);

    // Add event listener to navigate to the task
    container.addEventListener('click', (e) => {
        const taskEl = e.target.closest('[data-action="view-task"]');
        if (taskEl) {
            const taskId = taskEl.dataset.taskId;
            // Assuming openTaskFormModal is available globally or imported
            // In task.ui.js, it is available.
            const task = tasks.find(t => t.docId === taskId);
            if(task) {
                openTaskFormModal(task);
            }
        }
    });
}

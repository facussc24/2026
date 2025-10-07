import { checkUserPermission, showConfirmationModal, showToast } from '../../main.js';
import { getState } from './task.state.js';
import { deleteTask, loadTelegramConfig, saveTelegramConfig, sendTestTelegram, completeAndArchiveTask } from './task.service.js';
import { initTasksSortable } from './task.kanban.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.es.js";
import { getEmptyStateHTML, getTaskCardHTML, getSubtaskHTML, getAdminUserListHTML, getTasksTableHTML, getPaginationControlsHTML, getTaskTableFiltersHTML, getMyPendingTasksWidgetHTML, getTelegramConfigHTML, getPlannerHelpModalHTML, getTasksModalHTML } from './task.templates.js';
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
    const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Archivadas' };

    const state = getState();
    const showArchived = state.kanban.showArchived;

    const tasksByStatus = { todo: [], inprogress: [], done: [] };

    tasks.forEach(task => {
        if (task.isArchived) {
            if (showArchived) {
                tasksByStatus.done.push(task);
            }
        } else {
            tasksByStatus[task.status || 'todo'].push(task);
        }
    });

    container.querySelectorAll('.task-column').forEach(columnEl => {
        const status = columnEl.dataset.status;
        const taskListEl = columnEl.querySelector('.task-list');
        const columnTasks = tasksByStatus[status];

        if (columnTasks.length === 0) {
            taskListEl.innerHTML = getEmptyStateHTML(
                'inbox',
                'Columna Vacía',
                `No hay tareas en estado "${statusMap[status]}".`,
                { action: 'add-task-to-column', status: status, text: 'Añadir Tarea', icon: 'plus' }
            );
        } else {
            taskListEl.innerHTML = '';
            columnTasks.forEach(task => {
                const taskCardHTML = createTaskCard(task);
                const template = document.createElement('template');
                template.innerHTML = taskCardHTML.trim();
                const cardNode = template.content.firstChild;
                cardNode.addEventListener('click', async (e) => {
                    if (e.target.closest('.task-actions')) return;
                    await openTaskFormModal(task);
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

export function showTasksInModal(title, tasks) {
    // 1. Render the modal structure
    dom.modalContainer.innerHTML = getTasksModalHTML(title);
    const modalElement = document.getElementById('tasks-list-modal');
    const tasksContainer = modalElement.querySelector('#modal-tasks-container');

    // 2. Populate with tasks or a message
    if (!tasks || tasks.length === 0) {
        tasksContainer.innerHTML = `<p class="text-center text-slate-500 py-8">No hay tareas para mostrar en esta sección.</p>`;
    } else {
        tasks.forEach(task => {
            const taskCardHTML = createTaskCard(task);
            const template = document.createElement('template');
            template.innerHTML = taskCardHTML.trim();
            const cardNode = template.content.firstChild;

            // 3. Add event listener to each card
            cardNode.addEventListener('click', async (e) => {
                if (e.target.closest('.task-actions')) return;
                await openTaskFormModal(task);
            });
            tasksContainer.appendChild(cardNode);
        });
    }

    const showEmptyStateIfNeeded = () => {
        if (!tasksContainer.querySelector('[data-task-id]')) {
            tasksContainer.innerHTML = `<p class="text-center text-slate-500 py-8">No hay tareas para mostrar en esta sección.</p>`;
        }
    };

    const notifyTasksChanged = () => {
        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
    };

    tasksContainer.addEventListener('click', (event) => {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const taskId = actionButton.dataset.docId;
        if (!taskId) return;

        const taskCard = actionButton.closest('[data-task-id]');

        const setButtonLoading = (isLoading) => {
            actionButton.disabled = isLoading;
            actionButton.classList.toggle('opacity-60', isLoading);
            actionButton.classList.toggle('pointer-events-none', isLoading);
        };

        if (action === 'delete-task') {
            const targetButton = actionButton;
            showConfirmationModal(
                'Eliminar Tarea',
                '¿Estás seguro de que deseas eliminar esta tarea? Esta acción no se puede deshacer.',
                async () => {
                    try {
                        setButtonLoading(true);
                        await deleteTask(taskId);
                        if (taskCard) {
                            taskCard.remove();
                            showEmptyStateIfNeeded();
                        }
                        showToast('Tarea eliminada con éxito.', 'success');
                        notifyTasksChanged();
                    } catch (error) {
                        console.error('Error deleting task from modal:', error);
                        showToast('Error al eliminar la tarea.', 'error');
                        if (targetButton.isConnected) {
                            setButtonLoading(false);
                        }
                    }
                }
            );
        } else if (action === 'complete-task') {
            const previousHtml = actionButton.innerHTML;
            setButtonLoading(true);
            actionButton.innerHTML = '<span class="flex items-center gap-1"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Procesando</span>';
            lucide.createIcons();
            completeAndArchiveTask(taskId)
                .then(() => {
                    if (taskCard) {
                        taskCard.remove();
                        showEmptyStateIfNeeded();
                    }
                    showToast('Tarea completada y archivada.', 'success');
                    notifyTasksChanged();
                })
                .catch((error) => {
                    console.error('Error completing task from modal:', error);
                    showToast('Error al completar la tarea.', 'error');
                    if (actionButton.isConnected) {
                        actionButton.innerHTML = previousHtml;
                        setButtonLoading(false);
                        lucide.createIcons();
                    }
                });
        }
    });

    // 4. Add event listener to close the modal
    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            modalElement.remove();
        }
    });

    // 5. Render icons
    lucide.createIcons();
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

export function openAIAssistantModal() {
    const modalId = 'ai-assistant-modal';
    dom.modalContainer.innerHTML = getAIAssistantModalHTML();
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const responseContainer = modalElement.querySelector('#ai-assistant-response-container');
    const placeholder = modalElement.querySelector('#ai-assistant-placeholder');
    const loader = modalElement.querySelector('#ai-assistant-loader');
    const questionButtons = modalElement.querySelectorAll('.ai-question-btn');

    // This is a copy of the filter logic from task.dashboard.js
    // It's duplicated here to avoid a larger refactor of the state management.
    const applyFiltersForAI = (tasks) => {
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
    };

    const handleQuestionClick = async (e) => {
        const button = e.currentTarget;
        const question = button.dataset.question;

        // Disable all buttons to prevent multiple requests
        questionButtons.forEach(btn => btn.disabled = true);

        placeholder.classList.add('hidden');
        responseContainer.innerHTML = ''; // Clear previous response
        responseContainer.appendChild(loader);
        loader.classList.remove('hidden');

        try {
            const functions = getFunctions();
            const allTasks = getState().dashboard.allTasks;

            if (question === 'plan-my-week') {
                const unscheduledTasks = allTasks.filter(t => !t.plannedDate);

                if (unscheduledTasks.length === 0) {
                    showToast("¡Excelente! No tienes tareas sin planificar.", "success");
                    placeholder.classList.remove('hidden');
                    return; // Exit early
                }

                modalElement.remove(); // Close the current modal
                const analysisModal = showAIAnalysisModal();
                const analysisContent = analysisModal.querySelector('#ai-analysis-content');
                const applyBtn = analysisModal.querySelector('#apply-ai-plan-btn');

                const analyzeWeeklyTasks = httpsCallable(functions, 'analyzeWeeklyTasks');
                const result = await analyzeWeeklyTasks({ tasks: unscheduledTasks });

                // Using a library like 'marked' would be better, but for now, we'll inject the HTML.
                // The 'prose' class from Tailwind Typography will style it.
                analysisContent.innerHTML = DOMPurify.sanitize(result.data.analysis || '');

                applyBtn.disabled = false;
                applyBtn.addEventListener('click', async () => {
                    const overlay = analysisModal.querySelector('#ai-applying-plan-overlay');
                    overlay.classList.remove('hidden');
                    try {
                        const applyPlan = httpsCallable(functions, 'applyPlan');
                        await applyPlan({ plan: result.data.plan });
                        showToast('¡Plan semanal aplicado con éxito!', 'success');
                        analysisModal.remove();
                    } catch (err) {
                        showToast(`Error al aplicar el plan: ${err.message}`, 'error');
                        overlay.classList.add('hidden');
                    }
                });

            } else {
                 const visibleTasks = applyFiltersForAI(allTasks);

                if (visibleTasks.length === 0) {
                    throw new Error("No hay tareas visibles para analizar. Por favor, ajusta los filtros e inténtalo de nuevo.");
                }

                const getTaskSummaryWithAI = httpsCallable(functions, 'getTaskSummaryWithAI');
                const result = await getTaskSummaryWithAI({ tasks: visibleTasks, question });

                // The AI response is expected to be simple markdown.
                // We can inject it directly as the 'prose' class will style it.
                responseContainer.innerHTML = DOMPurify.sanitize(result.data.summary || '');
            }

        } catch (error) {
            const errorMessage = error.details?.message || error.message || "Ocurrió un error desconocido.";
            showToast(`Error del Asistente IA: ${errorMessage}`, 'error');
            responseContainer.innerHTML = `<p class="text-red-500">${errorMessage}</p>`;
            console.error("Error calling getTaskSummaryWithAI:", error);
        } finally {
            loader.classList.add('hidden');
            // Re-enable all buttons
            questionButtons.forEach(btn => btn.disabled = false);
        }
    };

    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    questionButtons.forEach(button => {
        button.addEventListener('click', handleQuestionClick);
    });
}

export function showPlannerHelpModal() {
    const modalId = 'planner-help-modal';
    dom.modalContainer.innerHTML = getPlannerHelpModalHTML();
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);

    const closeModal = () => {
        modalElement.remove();
    };

    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            closeModal();
        }
    });

    return modalElement;
}

export function showAIAnalysisModal() {
    const modalId = 'ai-analysis-modal';
    dom.modalContainer.innerHTML = getAIAnalysisModalHTML();
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);

    const closeModal = () => {
        modalElement.remove();
    };

    modalElement.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            closeModal();
        }
    });

    return modalElement;
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

    if (tasks.length === 0) {
        container.innerHTML = getEmptyStateHTML(
            'search-x',
            'No se encontraron tareas',
            'Prueba a cambiar o eliminar los filtros de búsqueda para ver más resultados.'
        );
        if (lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = getTasksTableHTML(tasks, userMap);
    if (lucide) {
        lucide.createIcons();
    }

    container.querySelectorAll('tr[data-task-id]').forEach(row => {
        row.addEventListener('click', async () => {
            const taskId = row.dataset.taskId;
            const task = tasks.find(t => t.docId === taskId);
            if(task) {
                await openTaskFormModal(task);
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

    if (tasks.length === 0) {
        container.innerHTML = getEmptyStateHTML(
            'check-circle-2',
            '¡Todo en orden!',
            'No tienes ninguna tarea pendiente asignada a ti.'
        );
        lucide.createIcons();
        return;
    }

    container.innerHTML = getMyPendingTasksWidgetHTML(tasks);

    // Add event listener to navigate to the task
    container.addEventListener('click', async (e) => {
        const taskEl = e.target.closest('[data-action="view-task"]');
        if (taskEl) {
            const taskId = taskEl.dataset.taskId;
            // Assuming openTaskFormModal is available globally or imported
            // In task.ui.js, it is available.
            const task = tasks.find(t => t.docId === taskId);
            if(task) {
                await openTaskFormModal(task);
            }
        }
    });
}

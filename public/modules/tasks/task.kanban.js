import { updateTaskStatus, subscribeToTasks, saveTelegramConfig, sendTestTelegram, loadTelegramConfig } from './task.service.js';
import { renderTaskFilters, renderTasks, renderAdminUserList, showAIAnalysisModal } from './task.ui.js';
import { openTaskFormModal } from './task.modal.js';
import { getKanbanBoardHTML } from './task.templates.js';
import { getState, setKanbanFilter, setKanbanSearchTerm, setKanbanPriorityFilter, setKanbanSelectedUser, setShowArchived, addUnsubscriber, clearUnsubscribers } from './task.state.js';
import { showToast } from '../../main.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

let db;
let appState;
let dom;
let lucide;
let switchView;
let functions;
let currentTasks = [];

export function initKanban(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    switchView = dependencies.switchView;
    functions = dependencies.functions;
}

export function initTasksSortable(container) {
    const lists = container.querySelectorAll('#task-board .task-list');
    lists.forEach(list => {
        if (list.sortable) {
            list.sortable.destroy();
        }

        list.sortable = new Sortable(list, {
            group: 'tasks',
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.no-drag',
            onEnd: async (evt) => {
                const taskId = evt.item.dataset.taskId;
                const newStatus = evt.to.closest('.task-column').dataset.status;
                try {
                    await updateTaskStatus(taskId, newStatus);
                    showToast('Tarea actualizada.', 'success');
                } catch (error) {
                    console.error("Error updating task status:", error);
                    showToast('Error al mover la tarea.', 'error');
                }
            }
        });
    });
}

import { COLLECTIONS } from '../../utils.js';

function fetchAndRenderTasks(container) {
    clearUnsubscribers();

    container.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-slate-500"><i data-lucide="loader" class="h-8 w-8 animate-spin mx-auto"></i><p class="mt-2">Cargando tareas...</p></div>`);
    lucide.createIcons();

    const onTasksReceived = (tasks) => {
        const state = getState();
        let filteredTasks = [...tasks];
        if (state.kanban.searchTerm) {
            filteredTasks = filteredTasks.filter(task =>
                task.title.toLowerCase().includes(state.kanban.searchTerm) ||
                (task.description && task.description.toLowerCase().includes(state.kanban.searchTerm))
            );
        }
        currentTasks = filteredTasks; // Store the currently displayed tasks
        setTimeout(() => renderTasks(filteredTasks, container), 0);
    };

    const handleError = (error) => {
        console.error("Error fetching tasks: ", error);
        let message = "Error al cargar las tareas.";
        if (error.code === 'failed-precondition') {
            message = "Error: Faltan índices en Firestore. Revise la consola para crear el índice necesario.";
        } else if (error.code === 'permission-denied') {
            message = "Error de permisos al cargar las tareas. Verifique las reglas de seguridad de Firestore.";
        }
        showToast(message, "error", 5000);
        container.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-red-500"><i data-lucide="alert-triangle" class="h-8 w-8 mx-auto"></i><p class="mt-2">${message}</p></div>`);
        lucide.createIcons();
    };

    const unsubscribers = subscribeToTasks(onTasksReceived, handleError);
    addUnsubscriber(unsubscribers);
}

function setupTaskFilters(container) {
    const filterContainer = container.querySelector('#task-filters');
    if (filterContainer) {
        filterContainer.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (button && button.dataset.filter) {
                setKanbanFilter(button.dataset.filter);
                renderTaskFilters(container);
                fetchAndRenderTasks(container);
            }
        });
    }
}

export function runKanbanBoardLogic(container) {
    const state = getState();
    if (state.kanban.activeFilter === 'supervision' && !state.kanban.selectedUserId) {
        const users = appState.collections.usuarios.filter(u => u.docId !== appState.currentUser.uid);
        renderAdminUserList(users, container);

        const userListContainer = container.querySelector('#admin-user-list-container');
        if (userListContainer) {
            userListContainer.addEventListener('click', e => {
                const card = e.target.closest('.admin-user-card');
                if (card && card.dataset.userId) {
                    setKanbanSelectedUser(card.dataset.userId);
                    runKanbanBoardLogic(container); // Re-run to show the selected user's board
                }
            });
        }
        return;
    }

    const selectedUser = appState.collections.usuarios.find(u => u.docId === state.kanban.selectedUserId);
    container.innerHTML = getKanbanBoardHTML(state, selectedUser);
    lucide.createIcons();

    setTimeout(() => {
        const addTaskBtn = container.querySelector('#add-new-task-btn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => openTaskFormModal());
        }

        const aiAnalystBtn = container.querySelector('#ai-analyst-btn');
        if (aiAnalystBtn) {
            aiAnalystBtn.addEventListener('click', async () => {
                if (currentTasks.length === 0) {
                    showToast('No hay tareas para analizar.', 'info');
                    return;
                }

                const modalElement = showAIAnalysisModal();
                const loader = modalElement.querySelector('#ai-analysis-loader');
                const contentContainer = modalElement.querySelector('#ai-analysis-content');

                try {
                    const analyzeWeeklyTasks = httpsCallable(functions, 'analyzeWeeklyTasks');
                    const result = await analyzeWeeklyTasks({ tasks: currentTasks });

                    if (result.data.analysis) {
                        // Use the 'marked' library to parse the Markdown response
                        const analysisHTML = marked.parse(result.data.analysis);
                        contentContainer.innerHTML = analysisHTML;
                    } else {
                        throw new Error("La respuesta de la IA estaba vacía.");
                    }

                } catch (error) {
                    console.error("Error calling analyzeWeeklyTasks function:", error);
                    showToast('Error al contactar al Analista IA.', 'error');
                    contentContainer.innerHTML = `<p class="text-red-500 p-4">Ocurrió un error al generar el análisis. Por favor, intente de nuevo.</p>`;
                }
            });
        }

        const toggleArchivedBtn = container.querySelector('#toggle-archived-btn');
        if (toggleArchivedBtn) {
            toggleArchivedBtn.addEventListener('click', () => {
                const state = getState();
                const newShowArchived = !state.kanban.showArchived;
                setShowArchived(newShowArchived);

                const archivedColumn = container.querySelector('.task-column[data-status="done"]');
                const taskBoard = container.querySelector('#task-board');
                const toggleText = container.querySelector('#toggle-archived-text');

                if (newShowArchived) {
                    archivedColumn.classList.remove('hidden');
                    taskBoard.classList.remove('md:grid-cols-2');
                    taskBoard.classList.add('md:grid-cols-3');
                    toggleText.textContent = 'Ocultar Archivadas';
                } else {
                    archivedColumn.classList.add('hidden');
                    taskBoard.classList.remove('md:grid-cols-3');
                    taskBoard.classList.add('md:grid-cols-2');
                    toggleText.textContent = 'Mostrar Archivadas';
                }
            });
        }

        const taskBoard = container.querySelector('#task-board');
        if(taskBoard) {
            taskBoard.addEventListener('click', e => {
                const header = e.target.closest('.kanban-column-header');
                if (header) {
                    header.parentElement.classList.toggle('collapsed');
                }
            });
        }

        const searchInput = container.querySelector('#task-search-input');
        if(searchInput) {
            searchInput.addEventListener('input', e => {
                setKanbanSearchTerm(e.target.value.toLowerCase());
                fetchAndRenderTasks(container);
            });
        }

        const priorityFilter = container.querySelector('#task-priority-filter');
        if(priorityFilter) {
            priorityFilter.addEventListener('change', e => {
                setKanbanPriorityFilter(e.target.value);
                fetchAndRenderTasks(container);
            });
        }

        setupTaskFilters(container);
        renderTaskFilters(container);
        fetchAndRenderTasks(container);

        appState.currentViewCleanup = () => {
            clearUnsubscribers();
            setKanbanSearchTerm('');
            setKanbanPriorityFilter('all');
            setKanbanSelectedUser(null);
        };
    }, 0);
}

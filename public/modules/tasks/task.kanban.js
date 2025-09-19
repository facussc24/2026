import { updateTaskStatus, subscribeToTasks, saveTelegramConfig, sendTestTelegram, loadTelegramConfig } from './task.service.js';
import { openTaskFormModal, renderTaskFilters, renderTasks, renderAdminUserList } from './task.ui.js';
import { getState, setKanbanFilter, setKanbanSearchTerm, setKanbanPriorityFilter, setKanbanSelectedUser, addUnsubscriber, clearUnsubscribers } from './task.state.js';
import { showToast } from '../../main.js';

let db;
let appState;
let dom;
let lucide;
let switchView;

export function initKanban(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    switchView = dependencies.switchView;
}

export function initTasksSortable() {
    const lists = document.querySelectorAll('.task-list');
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

import { collection, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from '../../utils.js';

export function runKanbanBoardLogic(container) {
    const state = getState();
    if (state.kanban.activeFilter === 'supervision' && !state.kanban.selectedUserId) {
        const users = appState.collections.usuarios.filter(u => u.docId !== appState.currentUser.uid);
        renderAdminUserList(users, container);

        const userListContainer = document.getElementById('admin-user-list-container');
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

    let topBarHTML = '';
    if (state.kanban.selectedUserId) {
        const selectedUser = appState.collections.usuarios.find(u => u.docId === state.kanban.selectedUserId);
        topBarHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Tareas de ${selectedUser?.name || 'Usuario'}</h3>
            <button data-action="admin-back-to-supervision" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Volver a Supervisión</button>
        </div>
        `;
    }

    container.innerHTML = `
        ${topBarHTML}
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 ${state.kanban.selectedUserId ? 'hidden' : ''}">
            <div id="task-filters" class="flex items-center gap-2 rounded-lg bg-slate-200 p-1 flex-wrap"></div>

            <div class="flex items-center gap-2 flex-grow w-full md:w-auto">
                <div class="relative flex-grow">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                    <input type="text" id="task-search-input" placeholder="Buscar tareas..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                </div>
                <div class="relative">
                    <select id="task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                        <option value="all">Prioridad (todas)</option>
                        <option value="high">Alta</option>
                        <option value="medium">Media</option>
                        <option value="low">Baja</option>
                    </select>
                    <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"></i>
                </div>
            </div>

            <div id="kanban-header-buttons" class="flex items-center gap-4 flex-shrink-0">
                <button id="add-new-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                    <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea
                </button>
            </div>
        </div>
        <div id="task-board" class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="todo">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="list-todo" class="w-5 h-5 text-yellow-600"></i>Por Hacer</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="inprogress">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="timer" class="w-5 h-5 text-blue-600"></i>En Progreso</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="done">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>Completadas</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
        </div>
    `;
    lucide.createIcons();

    setTimeout(() => {
        document.getElementById('add-new-task-btn').addEventListener('click', () => openTaskFormModal());
        document.getElementById('go-to-stats-view-btn').addEventListener('click', () => switchView('task-dashboard'));

        const telegramHeader = document.getElementById('telegram-config-header');
        if(telegramHeader) {
            telegramHeader.addEventListener('click', () => {
                const body = document.getElementById('telegram-config-body');
                const chevron = document.getElementById('telegram-config-chevron');
                const isHidden = body.style.display === 'none';

                body.style.display = isHidden ? 'block' : 'none';
                chevron.classList.toggle('rotate-180', isHidden);
            });
        }

        const saveTelegramBtn = document.getElementById('save-telegram-config-btn');
        if(saveTelegramBtn) saveTelegramBtn.addEventListener('click', saveTelegramConfig);

        const testTelegramBtn = document.getElementById('send-test-telegram-btn');
        if(testTelegramBtn) testTelegramBtn.addEventListener('click', sendTestTelegram);

        loadTelegramConfig();

        const taskBoard = document.getElementById('task-board');
        if(taskBoard) {
            taskBoard.addEventListener('click', e => {
                const header = e.target.closest('.kanban-column-header');
                if (header) {
                    header.parentElement.classList.toggle('collapsed');
                }
            });
        }

        const searchInput = document.getElementById('task-search-input');
        if(searchInput) {
            searchInput.addEventListener('input', e => {
                setKanbanSearchTerm(e.target.value.toLowerCase());
                fetchAndRenderTasks();
            });
        }

        const priorityFilter = document.getElementById('task-priority-filter');
        if(priorityFilter) {
            priorityFilter.addEventListener('change', e => {
                setKanbanPriorityFilter(e.target.value);
                fetchAndRenderTasks();
            });
        }

        setupTaskFilters();
        renderTaskFilters();
        fetchAndRenderTasks();

        appState.currentViewCleanup = () => {
            clearUnsubscribers();
            setKanbanSearchTerm('');
            setKanbanPriorityFilter('all');
            setKanbanSelectedUser(null);
        };
    }, 0);
}

function setupTaskFilters() {
    const filterContainer = document.getElementById('task-filters');
    filterContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button && button.dataset.filter) {
            setKanbanFilter(button.dataset.filter);
            renderTaskFilters();
            fetchAndRenderTasks();
        }
    });
}

function fetchAndRenderTasks() {
    clearUnsubscribers();

    document.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-slate-500"><i data-lucide="loader" class="h-8 w-8 animate-spin mx-auto"></i><p class="mt-2">Cargando tareas...</p></div>`);
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
        setTimeout(() => renderTasks(filteredTasks), 0);
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
        document.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-red-500"><i data-lucide="alert-triangle" class="h-8 w-8 mx-auto"></i><p class="mt-2">${message}</p></div>`);
        lucide.createIcons();
    };

    const unsubscribers = subscribeToTasks(onTasksReceived, handleError);
    addUnsubscriber(unsubscribers);
}

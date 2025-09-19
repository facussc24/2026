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

export function runKanbanBoardLogic() {
    const state = getState();
    if (state.kanban.activeFilter === 'supervision' && !state.kanban.selectedUserId) {
        const users = appState.collections.usuarios.filter(u => u.docId !== appState.currentUser.uid);
        renderAdminUserList(users, dom.viewContent);

        const userListContainer = document.getElementById('admin-user-list-container');
        if (userListContainer) {
            userListContainer.addEventListener('click', e => {
                const card = e.target.closest('.admin-user-card');
                if (card && card.dataset.userId) {
                    setKanbanSelectedUser(card.dataset.userId);
                    runKanbanBoardLogic(); // Re-run to show the selected user's board
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

    const telegramConfigHTML = `
    <div id="telegram-config-collapsible" class="bg-white rounded-xl shadow-lg mb-6 border border-blue-200 overflow-hidden">
        <button id="telegram-config-header" class="w-full flex justify-between items-center p-4">
            <div class="flex items-center gap-4">
                <i data-lucide="send" class="w-8 h-8 text-blue-500"></i>
                <div>
                    <h3 class="text-lg font-bold text-slate-800 text-left">Configuración de Notificaciones de Telegram</h3>
                    <p class="text-sm text-slate-500 text-left">Recibe notificaciones de tus tareas directamente en tu teléfono.</p>
                </div>
            </div>
            <i data-lucide="chevron-down" id="telegram-config-chevron" class="w-6 h-6 text-slate-500 transition-transform"></i>
        </button>
        <div id="telegram-config-body" class="p-6 pt-0" style="display: none;">
            <div class="mt-4 text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="info"></i>¿Cómo funciona?</p>
                    <ul class="list-disc list-inside space-y-1 pl-5">
                        <li>Recibirás un mensaje cuando alguien te <strong>asigne una tarea nueva</strong>.</li>
                        <li>Recibirás un mensaje cuando el estado de una <strong>tarea que tú creaste</strong> cambie (por ejemplo, de "Por Hacer" a "En Progreso").</li>
                    </ul>
                </div>
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="help-circle"></i>¿Cómo obtener tu Chat ID?</p>
                    <p class="pl-5">
                        Abre Telegram y busca el bot <a href="https://t.me/userinfobot" target="_blank" class="text-blue-600 font-semibold hover:underline">@userinfobot</a>. Inicia una conversación con él y te enviará tu Chat ID numérico. Cópialo y pégalo en el campo de abajo.
                    </p>
                </div>
            </div>
            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t">
                <div>
                    <label for="telegram-chat-id" class="block text-sm font-medium text-gray-700 mb-1">Tu Chat ID de Telegram</label>
                    <input type="text" id="telegram-chat-id" placeholder="Ingresa tu Chat ID numérico" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">¿Cuándo notificar?</label>
                    <div class="space-y-2 mt-2">
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-assignment" name="onAssignment" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Cuando se me asigna una tarea nueva.</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-status-change" name="onStatusChange" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Cuando una tarea que creé cambia de estado.</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-due-date-reminder" name="onDueDateReminder" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Un día antes del vencimiento de una tarea asignada.</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="mt-6 flex items-center gap-4">
                <button id="save-telegram-config-btn" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Configuración</button>
                <button id="send-test-telegram-btn" class="bg-slate-200 text-slate-700 px-6 py-2 rounded-md hover:bg-slate-300 font-semibold">Enviar Mensaje de Prueba</button>
            </div>
        </div>
    </div>
    `;

    dom.viewContent.innerHTML = `
        ${telegramConfigHTML}
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
                <button id="go-to-stats-view-btn" class="bg-slate-700 text-white px-5 py-2.5 rounded-full hover:bg-slate-800 flex items-center shadow-md transition-transform transform hover:scale-105 flex-shrink-0">
                    <i data-lucide="bar-chart-2" class="mr-2 h-5 w-5"></i>Ver Estadísticas
                </button>
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
        const addTaskBtn = container.querySelector('#add-new-task-btn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => openTaskFormModal());
        }

        const taskBoard = container.querySelector('#task-board');
        if (taskBoard) {
            taskBoard.addEventListener('click', e => {
                const header = e.target.closest('.kanban-column-header');
                if (header) {
                    header.parentElement.classList.toggle('collapsed');
                }
            });
        }

        const searchInput = container.querySelector('#task-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                setKanbanSearchTerm(e.target.value.toLowerCase());
                fetchAndRenderTasks();
            });
        }

        const priorityFilter = container.querySelector('#task-priority-filter');
        if (priorityFilter) {
            priorityFilter.addEventListener('change', e => {
                setKanbanPriorityFilter(e.target.value);
                fetchAndRenderTasks();
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

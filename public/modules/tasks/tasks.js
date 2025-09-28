import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { initTaskState } from './task.state.js';
import { initTaskService, deleteTask, subscribeToTasks, updateTaskStatus } from './task.service.js';
import { initTaskUI, renderMyPendingTasksWidget, renderTasksByProjectChart, openTelegramConfigModal } from './task.ui.js';
import { initTaskModal, openTaskFormModal } from './task.modal.js';
import { calculateOverdueTasksCount, fetchAllTasks, completeAndArchiveTask } from './task.service.js';

let dom;
let lucide;
let dependencies;

// Exported functions for other modules to use
export {
    calculateOverdueTasksCount,
    fetchAllTasks,
    renderMyPendingTasksWidget,
    renderTasksByProjectChart,
    openTaskFormModal
};

export function initTasksModule(deps) {
    dependencies = deps;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    initTaskState(dependencies);
    initTaskService(dependencies);
    initTaskUI(dependencies);
    initTaskModal(dependencies);
    console.log("Tasks module initialized.");
}

export function runTasksLogic() {
    // Local state for the unified view
    let state = {
        activeFilter: 'user', // 'user', 'public', 'all'
        searchTerm: '',
        unsubscribe: null
    };

    const fetchAndRender = () => {
        if (state.unsubscribe) {
            state.unsubscribe();
        }

        const { appState } = dependencies;
        const filters = {
            mode: state.activeFilter,
            userId: appState.currentUser.uid,
            searchTerm: state.searchTerm
        };

        const container = dom.viewContent.querySelector('#task-list-container');
        if (container) {
             container.innerHTML = `<div class="text-center py-16 text-gray-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i><p class="mt-2">Cargando tareas...</p></div>`;
             lucide.createIcons();
        }

        state.unsubscribe = subscribeToTasks(filters, ({ tasks }) => {
            renderTaskList(tasks);
        }, (error) => {
            console.error("Error fetching tasks for unified view", error);
            if (container) {
                container.innerHTML = `<p class="text-red-500 text-center">Error al cargar las tareas.</p>`;
            }
        });
    };

    const renderTaskList = (tasks) => {
        const container = dom.viewContent.querySelector('#task-list-container');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = `<div class="text-center py-16 text-gray-500"><i data-lucide="inbox" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No hay tareas</h3><p class="text-sm">No se encontraron tareas con los filtros actuales.</p></div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = `<div class="space-y-4">${tasks.map(createTaskItem).join('')}</div>`;
        lucide.createIcons();
    };

    const createTaskItem = (task) => {
        const assignee = dependencies.appState.collectionsById.usuarios.get(task.assigneeUid);
        const creator = dependencies.appState.collectionsById.usuarios.get(task.creatorUid);

        const priorityClasses = {
            high: 'border-red-500',
            medium: 'border-yellow-500',
            low: 'border-gray-400',
        };

        const statusOptions = ['todo', 'inprogress', 'done'].map(status =>
            `<option value="${status}" ${task.status === status ? 'selected' : ''}>
                ${{todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada'}[status]}
            </option>`
        ).join('');

        return `
            <div class="task-item bg-white shadow-sm rounded-lg p-4 flex items-start gap-4 border-l-4 ${priorityClasses[task.priority] || 'border-transparent'}">
                <div class="flex-grow">
                    <p class="font-bold text-lg text-gray-800">${task.title}</p>
                    <p class="text-sm text-gray-600 mt-1">${task.description || ''}</p>
                    <div class="text-xs text-gray-500 mt-3 flex items-center gap-4">
                        <span>Creada por: <strong>${creator ? creator.name : 'Desconocido'}</strong></span>
                        <span>Asignada a: <strong>${assignee ? assignee.name : 'Nadie'}</strong></span>
                        <span>Vencimiento: <strong>${task.dueDate || 'Sin fecha'}</strong></span>
                    </div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-2">
                    <select data-action="change-status" data-task-id="${task.docId}" class="text-sm border-gray-300 rounded-md p-1.5">${statusOptions}</select>
                    <button data-action="edit-task" data-task-id="${task.docId}" class="text-gray-500 hover:text-blue-600 p-1"><i data-lucide="edit" class="w-5 h-5 pointer-events-none"></i></button>
                </div>
            </div>
        `;
    };

    const renderMainLayout = () => {
        const { appState } = dependencies;
        const isAdmin = appState.currentUser.role === 'admin';

        dom.viewContent.innerHTML = `
            <div id="unified-task-view" class="animate-fade-in-up">
                <header class="flex justify-between items-center mb-6">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">Gestor de Tareas</h2>
                        <p class="text-slate-500">Un lugar central para todas tus tareas.</p>
                    </div>
                    <button id="add-new-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                        <i data-lucide="plus" class="mr-2 h-5 w-5"></i><span>Nueva Tarea</span>
                    </button>
                </header>

                <div class="bg-white p-4 rounded-lg shadow-sm mb-6 flex items-center gap-4">
                    <div id="task-filters" class="flex items-center bg-gray-200 rounded-lg p-1">
                        <button data-filter="user" class="task-filter-btn">Mis Tareas</button>
                        <button data-filter="public" class="task-filter-btn">Ingeniería (Públicas)</button>
                        ${isAdmin ? '<button data-filter="all" class="task-filter-btn">Todas</button>' : ''}
                    </div>
                    <div class="relative flex-grow">
                        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                        <input type="text" id="task-search-input" placeholder="Buscar por título o tag..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                    </div>
                </div>

                <div id="task-list-container"></div>
            </div>
        `;
        lucide.createIcons();
        attachEventListeners();
        updateFilterButtons();
        fetchAndRender();
    };

    const updateFilterButtons = () => {
        dom.viewContent.querySelectorAll('.task-filter-btn').forEach(btn => {
            btn.classList.toggle('bg-white', btn.dataset.filter === state.activeFilter);
            btn.classList.toggle('shadow-sm', btn.dataset.filter === state.activeFilter);
            btn.classList.toggle('text-blue-600', btn.dataset.filter === state.activeFilter);
        });
    };

    const attachEventListeners = () => {
        const view = dom.viewContent.querySelector('#unified-task-view');
        if (!view) return;

        view.addEventListener('click', (e) => {
            const filterButton = e.target.closest('.task-filter-btn');
            if (filterButton) {
                state.activeFilter = filterButton.dataset.filter;
                updateFilterButtons();
                fetchAndRender();
            }

            const addTaskBtn = e.target.closest('#add-new-task-btn');
            if(addTaskBtn) {
                openTaskFormModal();
            }

            const editTaskBtn = e.target.closest('button[data-action="edit-task"]');
            if(editTaskBtn) {
                const taskId = editTaskBtn.dataset.taskId;
                const taskDocRef = doc(dependencies.db, "tareas", taskId);
                getDoc(taskDocRef).then(docSnap => {
                    if (docSnap.exists()) {
                        openTaskFormModal({ ...docSnap.data(), docId: docSnap.id });
                    } else {
                        dependencies.showToast('Error: No se pudo encontrar la tarea para editar.', 'error');
                    }
                }).catch(error => {
                    console.error("Error fetching task for edit:", error);
                    dependencies.showToast('Error al cargar datos de la tarea.', 'error');
                });
            }
        });

        view.addEventListener('change', (e) => {
            const statusSelect = e.target.closest('select[data-action="change-status"]');
            if(statusSelect) {
                const taskId = statusSelect.dataset.taskId;
                const newStatus = statusSelect.value;
                updateTaskStatus(taskId, newStatus)
                    .then(() => dependencies.showToast('Estado de la tarea actualizado.', 'success'))
                    .catch(() => dependencies.showToast('Error al actualizar estado.', 'error'));
            }
        });

        const searchInput = view.querySelector('#task-search-input');
        searchInput.addEventListener('input', () => {
            state.searchTerm = searchInput.value;
            fetchAndRender();
        });
    };

    renderMainLayout();

    // Cleanup logic
    dependencies.appState.currentViewCleanup = () => {
        if (state.unsubscribe) {
            state.unsubscribe();
        }
        console.log("Cleaned up unified task view listeners.");
    };
}

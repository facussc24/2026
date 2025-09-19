import { checkUserPermission, showConfirmationModal, showToast } from '../../main.js';
import { getState } from './task.state.js';
import { handleTaskFormSubmit, deleteTask } from './task.service.js';
import { initTasksSortable } from './task.kanban.js';

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

export function createTaskCard(task) {
    const assignee = (appState.collections.usuarios || []).find(u => u.docId === task.assigneeUid);
    const priorities = {
        low: { label: 'Baja', color: 'bg-slate-100 text-slate-800' },
        medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
        high: { label: 'Alta', color: 'bg-red-100 text-red-800' }
    };
    const priority = priorities[task.priority] || priorities.medium;

    const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const isOverdue = dueDate && dueDate < today;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('es-AR') : 'Sin fecha';
    const urgencyClass = isOverdue ? 'border-red-600 bg-red-50/50' : 'border-slate-200';
    const dateClass = isOverdue ? 'text-red-600 font-bold' : 'text-slate-500';

    const creationDate = task.createdAt?.seconds ? new Date(task.createdAt.seconds * 1000) : null;
    const creationDateStr = creationDate ? creationDate.toLocaleDateString('es-AR') : 'N/A';

    const taskTypeIcon = task.isPublic
        ? `<span title="Tarea de Ingeniería (Pública)"><i data-lucide="briefcase" class="w-4 h-4 text-slate-400"></i></span>`
        : `<span title="Tarea Privada"><i data-lucide="lock" class="w-4 h-4 text-slate-400"></i></span>`;

    let subtaskProgressHTML = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const totalSubtasks = task.subtasks.length;
        const completedSubtasks = task.subtasks.filter(st => st.completed).length;
        const progressPercentage = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

        subtaskProgressHTML = `
            <div class="mt-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold text-slate-500 flex items-center">
                        <i data-lucide="check-square" class="w-3.5 h-3.5 mr-1.5"></i>
                        Sub-tareas
                    </span>
                    <span class="text-xs font-bold text-slate-600">${completedSubtasks} / ${totalSubtasks}</span>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-1.5">
                    <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style="width: ${progressPercentage}%"></div>
                </div>
            </div>
        `;
    }
    const dragClass = checkUserPermission('edit', task) ? '' : 'no-drag';

    return `
        <div class="task-card bg-white rounded-lg p-4 shadow-sm border ${urgencyClass} cursor-pointer hover:shadow-md hover:border-blue-400 animate-fade-in-up flex flex-col ${dragClass} transition-transform transform hover:-translate-y-1" data-task-id="${task.docId}">
            <div class="flex justify-between items-start gap-2 mb-2">
                <h4 class="font-bold text-slate-800 flex-grow">${task.title}</h4>
                ${taskTypeIcon}
            </div>

            <p class="text-sm text-slate-600 break-words flex-grow mb-3">${task.description || ''}</p>

            ${subtaskProgressHTML}

            <div class="mt-auto pt-3 border-t border-slate-200/80">
                <div class="flex justify-between items-center text-xs text-slate-500 mb-3">
                    <span class="px-2 py-0.5 rounded-full font-semibold ${priority.color}">${priority.label}</span>
                    <div class="flex items-center gap-3">
                        <span class="flex items-center gap-1.5 font-medium" title="Fecha de creación">
                            <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i> ${creationDateStr}
                        </span>
                        <span class="flex items-center gap-1.5 font-medium ${dateClass}" title="Fecha de entrega">
                            <i data-lucide="calendar-check" class="w-3.5 h-3.5"></i> ${dueDateStr}
                        </span>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        ${assignee ? `<img src="${assignee.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(assignee.name || assignee.email)}`}" title="Asignada a: ${assignee.name || assignee.email}" class="w-6 h-6 rounded-full">` : '<div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center" title="No asignada"><i data-lucide="user-x" class="w-4 h-4 text-gray-500"></i></div>'}
                        <span class="text-sm text-slate-500">${assignee ? (assignee.name || assignee.email.split('@')[0]) : 'No asignada'}</span>
                    </div>
                    <div class="task-actions">
                    ${checkUserPermission('delete', task) ? `
                        <button data-action="delete-task" data-doc-id="${task.docId}" class="text-gray-400 hover:text-red-600 p-1 rounded-full" title="Eliminar tarea">
                            <i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function renderSubtask(subtask) {
    const titleClass = subtask.completed ? 'line-through text-slate-500' : 'text-slate-800';
    const containerClass = subtask.completed ? 'opacity-70' : '';
    const checkboxId = `subtask-checkbox-${subtask.id}`;
    return `
        <div class="subtask-item group flex items-center gap-3 p-2 bg-slate-100 hover:bg-slate-200/70 rounded-md transition-all duration-150 ${containerClass}" data-subtask-id="${subtask.id}">
            <label for="${checkboxId}" class="flex-grow flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="${checkboxId}" name="${checkboxId}" class="subtask-checkbox h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" ${subtask.completed ? 'checked' : ''}>
                <span class="flex-grow text-sm font-medium ${titleClass}">${subtask.title}</span>
            </label>
            <button type="button" class="subtask-delete-btn text-slate-400 hover:text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
        </div>
    `;
}

export function populateTaskAssigneeDropdown() {
    const select = document.getElementById('task-assignee');
    if (!select) return; // Modal is not open

    const users = appState.collections.usuarios || [];
    if (users.length === 0) {
        select.innerHTML = '<option value="">No hay usuarios</option>';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    const selectedUid = select.dataset.selectedUid;

    const userOptions = users
        .filter(u => u.disabled !== true)
        .map(u => {
            const displayName = u.name || u.email.split('@')[0];
            return `<option value="${u.docId}">${displayName}</option>`;
        }).join('');

    select.innerHTML = `<option value="">No asignada</option>${userOptions}`;

    if (selectedUid) {
        select.value = selectedUid;
    }
}

export function renderTaskFilters() {
    const filters = [
        { key: 'engineering', label: 'Ingeniería' },
        { key: 'personal', label: 'Mis Tareas' }
    ];
    if (appState.currentUser.role === 'admin') {
        filters.push({ key: 'all', label: 'Todas' });
    }
    const filterContainer = document.getElementById('task-filters');
    if (filterContainer) {
        filterContainer.innerHTML = filters.map(f => `
            <button data-filter="${f.key}" class="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${getState().kanban.activeFilter === f.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-300/50'}">
                ${f.label}
            </button>
        `).join('');
    }
}

export function renderTasks(tasks) {
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

    document.querySelectorAll('.task-column').forEach(columnEl => {
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

    initTasksSortable();
    lucide.createIcons();
}

export async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;

    // Determine the UID to be pre-selected in the dropdown.
    let selectedUid = defaultAssigneeUid || ''; // Prioritize passed-in UID
    if (!selectedUid) { // If no default is provided, use existing logic
        if (isEditing && task.assigneeUid) {
            selectedUid = task.assigneeUid;
        } else if (!isEditing && getState().kanban.activeFilter === 'personal') {
            // When creating a new personal task, assign it to self by default
            selectedUid = appState.currentUser.uid;
        }
    }

    const modalHTML = `
    <div id="task-form-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
            <div class="flex justify-between items-center p-5 border-b border-slate-200">
                <h3 class="text-xl font-bold text-slate-800">${isEditing ? 'Editar' : 'Nueva'} Tarea</h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
            </div>
            <form id="task-form" class="p-6 overflow-y-auto auth-form" novalidate>
                <input type="hidden" name="taskId" value="${isEditing ? task.docId : ''}">
                <input type="hidden" name="status" value="${isEditing ? task.status : defaultStatus}">

                <div class="input-group">
                    <label for="task-title">Título</label>
                    <input type="text" id="task-title" name="title" value="${isEditing && task.title ? task.title : ''}" required>
                </div>

                <div class="input-group">
                    <label for="task-description">Descripción</label>
                    <textarea id="task-description" name="description" rows="4">${isEditing && task.description ? task.description : ''}</textarea>
                </div>

                <div class="input-group">
                    <label for="task-assignee">Asignar a</label>
                    <select id="task-assignee" name="assigneeUid" data-selected-uid="${selectedUid}">
                        <option value="">Cargando...</option>
                    </select>
                </div>
                <div class="input-group">
                    <label for="task-priority">Prioridad</label>
                    <select id="task-priority" name="priority">
                        <option value="low" ${isEditing && task.priority === 'low' ? 'selected' : ''}>Baja</option>
                        <option value="medium" ${!isEditing || (isEditing && task.priority === 'medium') ? 'selected' : ''}>Media</option>
                        <option value="high" ${isEditing && task.priority === 'high' ? 'selected' : ''}>Alta</option>
                    </select>
                </div>

                <div class="input-group">
                    <label for="task-startdate">Fecha de Inicio</label>
                    <input type="date" id="task-startdate" name="startDate" value="${isEditing && task.startDate ? task.startDate : (defaultDate || '')}">
                </div>
                <div class="input-group">
                    <label for="task-duedate">Fecha Límite</label>
                    <input type="date" id="task-duedate" name="dueDate" value="${isEditing && task.dueDate ? task.dueDate : (defaultDate || '')}">
                </div>

                <!-- Subtasks -->
                <div class="input-group">
                    <label>Sub-tareas</label>
                    <div id="subtasks-list" class="space-y-2 max-h-48 overflow-y-auto p-2 rounded-md bg-slate-50 border"></div>
                    <div class="flex items-center gap-2 mt-2">
                        <input type="text" id="new-subtask-title" placeholder="Añadir sub-tarea y presionar Enter">
                    </div>
                </div>

                <!-- Comments -->
                <div class="input-group">
                    <label>Comentarios</label>
                    <div id="task-comments-list" class="space-y-3 max-h-60 overflow-y-auto p-3 rounded-md bg-slate-50 border custom-scrollbar">
                        <p class="text-xs text-center text-slate-400 py-2">Cargando comentarios...</p>
                    </div>
                    <div class="flex items-start gap-2 mt-2">
                        <textarea id="new-task-comment" placeholder="Escribe un comentario..." rows="2"></textarea>
                        <button type="button" id="post-comment-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold h-full">
                            <i data-lucide="send" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>

                ${appState.currentUser.role === 'admin' ? `
                <div class="input-group">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="task-is-public" name="isPublic" class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isEditing && task.isPublic ? 'checked' : ''}>
                        <span>Tarea Pública (Visible para todos en Ingeniería)</span>
                    </label>
                </div>
                ` : ''}
            </form>
            <div class="flex justify-end items-center p-4 border-t border-slate-200 bg-slate-50 space-x-3">
                ${isEditing ? `<button data-action="delete" class="text-red-600 font-semibold mr-auto px-4 py-2 rounded-md hover:bg-red-50">Eliminar Tarea</button>` : ''}
                <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                <button type="submit" form="task-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Tarea</button>
            </div>
        </div>
    </div>
    `;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById('task-form-modal');

    // Ensure users are loaded before populating the dropdown
    if (!appState.collections.usuarios || appState.collections.usuarios.length === 0) {
        console.log("User collection is empty, fetching...");
        const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USUARIOS));
        appState.collections.usuarios = usersSnapshot.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.usuarios = new Map(appState.collections.usuarios.map(u => [u.docId, u]));
        console.log("User collection fetched and populated.");
    }
    populateTaskAssigneeDropdown();

    const subtaskListEl = modalElement.querySelector('#subtasks-list');
    const newSubtaskInput = modalElement.querySelector('#new-subtask-title');

    let currentSubtasks = isEditing && task.subtasks ? [...task.subtasks] : [];

    const rerenderSubtasks = () => {
        subtaskListEl.innerHTML = currentSubtasks.map(renderSubtask).join('') || '<p class="text-xs text-center text-slate-400 py-2">No hay sub-tareas.</p>';
        modalElement.dataset.subtasks = JSON.stringify(currentSubtasks);
        lucide.createIcons();
    };

    newSubtaskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const title = newSubtaskInput.value.trim();
            if (title) {
                currentSubtasks.push({
                    id: `sub_${Date.now()}`,
                    title: title,
                    completed: false
                });
                newSubtaskInput.value = '';
                rerenderSubtasks();
            }
        }
    });

    subtaskListEl.addEventListener('click', e => {
        const subtaskItem = e.target.closest('.subtask-item');
        if (!subtaskItem) return;

        const subtaskId = subtaskItem.dataset.subtaskId;
        const subtask = currentSubtasks.find(st => st.id === subtaskId);

        if (e.target.matches('.subtask-checkbox')) {
            if (subtask) {
                subtask.completed = e.target.checked;
                rerenderSubtasks();
            }
        }

        if (e.target.closest('.subtask-delete-btn')) {
            if (subtask) {
                currentSubtasks = currentSubtasks.filter(st => st.id !== subtaskId);
                rerenderSubtasks();
            }
        }
    });

    rerenderSubtasks(); // Initial render

    // --- Comments Logic ---
    const commentsListEl = modalElement.querySelector('#task-comments-list');
    const newCommentInput = modalElement.querySelector('#new-task-comment');
    const postCommentBtn = modalElement.querySelector('#post-comment-btn');
    let commentsUnsubscribe = null;

    const renderTaskComments = (comments) => {
        if (!commentsListEl) return;
        if (comments.length === 0) {
            commentsListEl.innerHTML = '<p class="text-xs text-center text-slate-400 py-2">No hay comentarios todavía.</p>';
            return;
        }
        commentsListEl.innerHTML = comments.map(comment => {
            const author = (appState.collections.usuarios || []).find(u => u.docId === comment.creatorUid) || { name: 'Usuario Desconocido', photoURL: '' };
            const timestamp = comment.createdAt?.toDate ? formatTimeAgo(comment.createdAt.toDate()) : 'hace un momento';
            return `
                <div class="flex items-start gap-3">
                    <img src="${author.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(author.name)}`}" alt="Avatar" class="w-8 h-8 rounded-full mt-1">
                    <div class="flex-1 bg-white p-3 rounded-lg border">
                        <div class="flex justify-between items-center">
                            <p class="font-bold text-sm text-slate-800">${author.name}</p>
                            <p class="text-xs text-slate-400">${timestamp}</p>
                        </div>
                        <p class="text-sm text-slate-600 mt-1 whitespace-pre-wrap">${comment.text}</p>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
        // Scroll to the bottom of the comments list
        commentsListEl.scrollTop = commentsListEl.scrollHeight;
    };

    if (isEditing) {
        postCommentBtn.disabled = false;
        newCommentInput.disabled = false;
        const commentsRef = collection(db, 'tareas', task.docId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));
        commentsUnsubscribe = onSnapshot(q, (snapshot) => {
            const comments = snapshot.docs.map(doc => doc.data());
            renderTaskComments(comments);
        });
    } else {
        renderTaskComments([]); // Show "No hay comentarios" for new tasks
        postCommentBtn.disabled = true;
        newCommentInput.disabled = true;
        newCommentInput.placeholder = 'Guarde la tarea para poder añadir comentarios.';
    }

    const postComment = async () => {
        const text = newCommentInput.value.trim();
        if (!text || !isEditing) return;

        postCommentBtn.disabled = true;
        const commentsRef = collection(db, 'tareas', task.docId, 'comments');
        try {
            await addDoc(commentsRef, {
                text: text,
                creatorUid: appState.currentUser.uid,
                createdAt: new Date()
            });
            newCommentInput.value = '';
        } catch (error) {
            console.error("Error posting comment: ", error);
            showToast('Error al publicar el comentario.', 'error');
        } finally {
            postCommentBtn.disabled = false;
        }
    };

    postCommentBtn.addEventListener('click', postComment);
    newCommentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            postComment();
        }
    });

    // Autofocus the title field for new tasks
    if (!isEditing) {
        modalElement.querySelector('#task-title').focus();
    }
    modalElement.querySelector('form').addEventListener('submit', handleTaskFormSubmit);

    modalElement.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'close') {
            if (commentsUnsubscribe) {
                commentsUnsubscribe();
            }
            modalElement.remove();
        } else if (action === 'delete') {
            showConfirmationModal('Eliminar Tarea', '¿Estás seguro de que quieres eliminar esta tarea?', async () => {
                try {
                    if (commentsUnsubscribe) {
                        commentsUnsubscribe();
                    }
                    await deleteTask(task.docId);
                    showToast('Tarea eliminada.', 'success');
                    modalElement.remove();
                } catch (error) {
                    showToast('No tienes permiso para eliminar esta tarea.', 'error');
                }
            });
        }
    });
}

export function renderFilteredAdminTaskTable() {
    const container = document.getElementById('task-data-table-container');
    if (!container) return;

    const state = getState();
    const allTasks = state.dashboard.allTasks;
    const userMap = appState.collectionsById.usuarios;

    // Get filter values
    const searchTerm = document.getElementById('admin-task-search')?.value.toLowerCase() || '';
    const selectedUser = document.getElementById('admin-task-user-filter')?.value || 'all';
    const selectedPriority = document.getElementById('admin-task-priority-filter')?.value || 'all';
    const selectedStatus = document.getElementById('admin-task-status-filter')?.value || 'active';

    // Apply filters
    let filteredTasks = allTasks.filter(task => {
        const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm);
        const matchesUser = selectedUser === 'all' || task.assigneeUid === selectedUser;
        const matchesPriority = selectedPriority === 'all' || task.priority === selectedPriority;

        let matchesStatus = true;
        if (selectedStatus === 'active') {
            matchesStatus = task.status !== 'done';
        } else if (selectedStatus !== 'all') {
            matchesStatus = task.status === selectedStatus;
        }

        return matchesSearch && matchesUser && matchesPriority && matchesStatus;
    });

    if (filteredTasks.length === 0) {
        container.innerHTML = `<p class="text-center py-16 text-slate-500">No se encontraron tareas con los filtros seleccionados.</p>`;
        return;
    }

    const tableHtml = `
        <table class="w-full text-sm text-left text-slate-600">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100">
                <tr>
                    <th scope="col" class="px-6 py-3">Tarea</th>
                    <th scope="col" class="px-6 py-3">Asignado a</th>
                    <th scope="col" class="px-6 py-3">Prioridad</th>
                    <th scope="col" class="px-6 py-3">Estado</th>
                    <th scope="col" class="px-6 py-3">Fecha Límite</th>
                    <th scope="col" class="px-6 py-3"><span class="sr-only">Acciones</span></th>
                </tr>
            </thead>
            <tbody>
                ${filteredTasks.map(task => {
                    const assignee = userMap.get(task.assigneeUid);
                    const priorityClasses = { high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-slate-100 text-slate-800' };
                    const statusClasses = { todo: 'bg-blue-100 text-blue-800', inprogress: 'bg-purple-100 text-purple-800', done: 'bg-green-100 text-green-800' };
                    const statusText = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };

                    return `
                        <tr class="bg-white border-b hover:bg-slate-50">
                            <th scope="row" class="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">${task.title}</th>
                            <td class="px-6 py-4">${assignee?.name || 'No asignado'}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${priorityClasses[task.priority] || ''}">${task.priority}</span></td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusClasses[task.status] || ''}">${statusText[task.status] || task.status}</span></td>
                            <td class="px-6 py-4">${task.dueDate || 'N/A'}</td>
                            <td class="px-6 py-4 text-right">
                                <button data-action="edit-task" data-task-id="${task.docId}" class="font-medium text-blue-600 hover:underline">Editar</button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHtml;
    lucide.createIcons();

    // Add event listeners for edit buttons
    container.querySelectorAll('[data-action="edit-task"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const taskId = e.target.dataset.taskId;
            const task = allTasks.find(t => t.docId === taskId);
            if (task) {
                openTaskFormModal(task);
            }
        });
    });
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

export function renderAdminUserList(users, container) {
    container.innerHTML = `
        <div class="bg-white p-8 rounded-xl shadow-lg border animate-fade-in-up">
            <div class="max-w-3xl mx-auto text-center">
                <i data-lucide="users" class="w-16 h-16 mx-auto text-slate-300"></i>
                <h2 class="text-3xl font-extrabold text-slate-800 mt-4">Modo Supervisión</h2>
                <p class="text-slate-500 mt-2 text-lg">Selecciona un usuario para ver su tablero de tareas.</p>
            </div>
            <div id="admin-user-list-container" class="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${users.map(user => `
                    <div class="admin-user-card text-center p-6 bg-slate-50 rounded-lg hover:shadow-xl hover:bg-white hover:-translate-y-1 transition-all duration-200 cursor-pointer border" data-user-id="${user.docId}">
                        <img src="${user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.name)}`}" alt="Avatar" class="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white shadow-md">
                        <h3 class="font-bold text-slate-800">${user.name}</h3>
                        <p class="text-sm text-slate-500">${user.email}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
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

export function renderMyPendingTasksWidget(tasks) {
    const container = document.getElementById('my-pending-tasks-widget');
    const countEl = document.getElementById('my-pending-tasks-count');

    if (!container || !countEl) {
        return;
    }

    countEl.textContent = tasks.length;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">¡No tienes tareas pendientes!</p>';
        return;
    }

    container.innerHTML = tasks.map(task => {
        const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = dueDate && dueDate < today;
        const dateClass = isOverdue ? 'text-red-500 font-semibold' : 'text-slate-500';
        const dueDateStr = dueDate ? `Vence: ${dueDate.toLocaleDateString('es-AR')}` : 'Sin fecha';

        const priorityClasses = {
            high: 'border-red-500',
            medium: 'border-yellow-500',
            low: 'border-slate-300',
        };
        const priorityBorder = priorityClasses[task.priority] || 'border-slate-300';

        return `
            <div class="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border-l-4 ${priorityBorder} cursor-pointer" data-action="view-task" data-task-id="${task.docId}">
                <div class="flex justify-between items-center">
                    <p class="font-bold text-slate-800 text-sm">${task.title}</p>
                    <span class="text-xs ${dateClass}">${dueDateStr}</span>
                </div>
            </div>
        `;
    }).join('');

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

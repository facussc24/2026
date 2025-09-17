import { collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, or } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from './../utils.js';

// Dependencies from main.js, to be injected via initTasksModule
let db;
let functions;
let appState;
let dom;
let showToast;
let showConfirmationModal;
let switchView;
let checkUserPermission;
let lucide;

// Module-specific state
let taskState = {
    activeFilter: 'personal', // 'engineering', 'personal', 'all', 'supervision'
    searchTerm: '',
    priorityFilter: 'all',
    unsubscribers: [],
    selectedUserId: null // For admin view
};

let adminTaskViewState = {
    tasks: [],
    viewMode: 'all',
    filters: { searchTerm: '', user: 'all', priority: 'all', status: 'active' },
    sort: { by: 'createdAt', order: 'desc' },
    pagination: { currentPage: 1, pageSize: 10 },
    calendar: { currentDate: new Date(), view: 'monthly' }
};

let adminCharts = { statusChart: null, priorityChart: null, userLoadChart: null };

function createTaskCard(task) {
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

async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;

    // Determine the UID to be pre-selected in the dropdown.
    let selectedUid = defaultAssigneeUid || ''; // Prioritize passed-in UID
    if (!selectedUid) { // If no default is provided, use existing logic
        if (isEditing && task.assigneeUid) {
            selectedUid = task.assigneeUid;
        } else if (!isEditing && taskState.activeFilter === 'personal') {
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
                    await deleteDoc(doc(db, COLLECTIONS.TAREAS, task.docId));
                    showToast('Tarea eliminada.', 'success');
                    modalElement.remove();
                } catch (error) {
                    showToast('No tienes permiso para eliminar esta tarea.', 'error');
                }
            });
        }
    });
}


function renderSubtask(subtask) {
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

function populateTaskAssigneeDropdown() {
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

function initTasksSortable() {
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
                const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
                try {
                    await updateDoc(taskRef, { status: newStatus });
                    showToast('Tarea actualizada.', 'success');
                } catch (error) {
                    console.error("Error updating task status:", error);
                    showToast('Error al mover la tarea.', 'error');
                }
            }
        });
    });
}

async function handleTaskFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const taskId = form.querySelector('[name="taskId"]').value;
    const isEditing = !!taskId;

    const modalElement = form.closest('#task-form-modal');
    const data = {
        title: form.querySelector('[name="title"]').value,
        description: form.querySelector('[name="description"]').value,
        assigneeUid: form.querySelector('[name="assigneeUid"]').value,
        priority: form.querySelector('[name="priority"]').value,
        startDate: form.querySelector('[name="startDate"]').value,
        dueDate: form.querySelector('[name="dueDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement.dataset.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

    const isPublicCheckbox = form.querySelector('[name="isPublic"]');
    if (isPublicCheckbox) {
        data.isPublic = isPublicCheckbox.checked;
    } else if (!isEditing) {
        data.isPublic = taskState.activeFilter === 'engineering';
    }

    const saveButton = form.closest('.modal-content').querySelector('button[type="submit"]');
    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
    lucide.createIcons();

    let success = false;
    try {
        if (isEditing) {
            const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
            await updateDoc(taskRef, data);
            showToast('Tarea actualizada con éxito.', 'success');
        } else {
            data.creatorUid = appState.currentUser.uid;
            data.createdAt = new Date();
            data.status = form.querySelector('[name="status"]').value || 'todo';
            await addDoc(collection(db, COLLECTIONS.TAREAS), data);
            showToast('Tarea creada con éxito.', 'success');
        }
        success = true;
        document.getElementById('task-form-modal').remove();
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Error al guardar la tarea.', 'error');
    } finally {
        if (!success) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonHTML;
        }
    }
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

// =================================================================================
// --- 7. LÓGICA DE TAREAS (KANBAN BOARD) ---
// =================================================================================
function renderAdminUserList() {
    const users = appState.collections.usuarios || [];
    const tasks = appState.collections.tareas || [];
    const adminId = appState.currentUser.uid;

    const userTaskStats = users
        .filter(user => user.docId !== adminId)
        .map(user => {
            const userTasks = tasks.filter(task => task.assigneeUid === user.docId);
            return {
                ...user,
                stats: {
                    todo: userTasks.filter(t => t.status === 'todo').length,
                    inprogress: userTasks.filter(t => t.status === 'inprogress').length,
                    done: userTasks.filter(t => t.status === 'done').length
                }
            };
        });

    let content = `
        <div class="bg-white p-6 rounded-xl shadow-lg animate-fade-in-up">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-2xl font-bold">Supervisión de Tareas de Usuarios</h3>
                <button data-action="admin-back-to-board" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Volver al Tablero</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    `;

    if (userTaskStats.length === 0) {
        content += `<p class="text-slate-500 col-span-full text-center py-12">No hay otros usuarios para supervisar.</p>`;
    } else {
        userTaskStats.forEach(user => {
            content += `
            <div class="border rounded-lg p-4 hover:shadow-md transition-shadow animate-fade-in-up">
                    <div class="flex items-center space-x-4">
                        <img src="${user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.name || user.email)}`}" alt="Avatar" class="w-12 h-12 rounded-full">
                        <div>
                            <p class="font-bold text-slate-800">${user.name || user.email}</p>
                            <p class="text-sm text-slate-500">${user.email}</p>
                        </div>
                    </div>
                    <div class="mt-4 flex justify-around text-center">
                        <div>
                            <p class="text-2xl font-bold text-yellow-600">${user.stats.todo}</p>
                            <p class="text-xs text-slate-500">Por Hacer</p>
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-blue-600">${user.stats.inprogress}</p>
                            <p class="text-xs text-slate-500">En Progreso</p>
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-green-600">${user.stats.done}</p>
                            <p class="text-xs text-slate-500">Completadas</p>
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button data-action="view-user-tasks" data-user-id="${user.docId}" class="flex-1 bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Ver Tareas</button>
                        <button data-action="assign-task-to-user" data-user-id="${user.docId}" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold">Asignar Tarea</button>
                    </div>
                </div>
            `;
        });
    }

    content += `</div></div>`;

    dom.viewContent.innerHTML = content;
    lucide.createIcons();
}

function setupTaskFilters() {
    const filterContainer = document.getElementById('task-filters');
    filterContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button && button.dataset.filter) {
            taskState.activeFilter = button.dataset.filter;
            renderTaskFilters();
            fetchAndRenderTasks();
        }
    });
}

function renderTaskFilters() {
    const filters = [
        { key: 'engineering', label: 'Ingeniería' },
        { key: 'personal', label: 'Mis Tareas' }
    ];
    if (appState.currentUser.role === 'admin') {
        filters.push({ key: 'all', label: 'Todas' });
    }
    const filterContainer = document.getElementById('task-filters');
    filterContainer.innerHTML = filters.map(f => `
        <button data-filter="${f.key}" class="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${taskState.activeFilter === f.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-300/50'}">
            ${f.label}
        </button>
    `).join('');
}

function fetchAndRenderTasks() {
    taskState.unsubscribers.forEach(unsub => unsub());
    taskState.unsubscribers = [];

    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const user = appState.currentUser;

    document.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-slate-500"><i data-lucide="loader" class="h-8 w-8 animate-spin mx-auto"></i><p class="mt-2">Cargando tareas...</p></div>`);
    lucide.createIcons();

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

    const applyClientSideFilters = (tasks) => {
        let filtered = [...tasks];
        if (taskState.priorityFilter !== 'all') {
            filtered = filtered.filter(t => (t.priority || 'medium') === taskState.priorityFilter);
        }
        if (taskState.searchTerm) {
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(taskState.searchTerm) ||
                (task.description && task.description.toLowerCase().includes(taskState.searchTerm))
            );
        }
        return filtered;
    };

    if (taskState.activeFilter === 'personal') {
        let assignedTasks = [];
        let createdTasks = [];

        const mergeAndRender = () => {
            const allPersonalTasks = [...assignedTasks, ...createdTasks];
            const uniqueTasks = Array.from(new Map(allPersonalTasks.map(t => [t.docId, t])).values());
            const filtered = applyClientSideFilters(uniqueTasks);
            setTimeout(() => renderTasks(filtered), 0);
        };

        const assignedQuery = query(tasksRef, where('assigneeUid', '==', user.uid));
        const createdQuery = query(tasksRef, where('creatorUid', '==', user.uid));

        const unsubAssigned = onSnapshot(assignedQuery, (snapshot) => {
            assignedTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            mergeAndRender();
        }, handleError);

        const unsubCreated = onSnapshot(createdQuery, (snapshot) => {
            createdTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            mergeAndRender();
        }, handleError);

        taskState.unsubscribers.push(unsubAssigned, unsubCreated);

    } else {
        let queryConstraints = [orderBy('createdAt', 'desc')];
        if (taskState.selectedUserId) {
            queryConstraints.unshift(where('assigneeUid', '==', taskState.selectedUserId));
        } else if (taskState.activeFilter === 'engineering') {
            queryConstraints.unshift(where('isPublic', '==', true));
        } else if (taskState.activeFilter !== 'all' || user.role !== 'admin') {
             if (taskState.activeFilter !== 'all') {
                queryConstraints.unshift(where('isPublic', '==', true));
            }
        }
        
        const q = query(tasksRef, ...queryConstraints);

        const unsub = onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            const filtered = applyClientSideFilters(tasks);
            setTimeout(() => renderTasks(filtered), 0);
        }, handleError);

        taskState.unsubscribers.push(unsub);
    }
}

function renderTasks(tasks) {
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

// --- HELPER FUNCTIONS FOR KANBAN LOGIC (moved outside for clarity) ---
const loadTelegramConfig = () => {
    const user = appState.currentUser;
    if (user) {
        const chatIdInput = document.getElementById('telegram-chat-id');
        const onAssignmentCheck = document.getElementById('notify-on-assignment');
        const onStatusChangeCheck = document.getElementById('notify-on-status-change');
        const onDueDateReminderCheck = document.getElementById('notify-on-due-date-reminder');
        if (chatIdInput) chatIdInput.value = user.telegramChatId || '';
        if (onAssignmentCheck) onAssignmentCheck.checked = user.telegramNotifications?.onAssignment !== false;
        if (onStatusChangeCheck) onStatusChangeCheck.checked = user.telegramNotifications?.onStatusChange !== false;
        if (onDueDateReminderCheck) onDueDateReminderCheck.checked = user.telegramNotifications?.onDueDateReminder !== false;
    }
};
const saveTelegramConfig = async () => {
    const chatId = document.getElementById('telegram-chat-id').value.trim();
    if (!chatId || !/^-?\d+$/.test(chatId)) {
        showToast('Por favor, ingrese un Chat ID de Telegram válido (solo números).', 'error');
        return;
    }
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    try {
        await updateDoc(userDocRef, {
            telegramChatId: chatId,
            telegramNotifications: {
                onAssignment: document.getElementById('notify-on-assignment').checked,
                onStatusChange: document.getElementById('notify-on-status-change').checked,
                onDueDateReminder: document.getElementById('notify-on-due-date-reminder').checked
            }
        });
        showToast('Configuración de Telegram guardada.', 'success');
    } catch (error) {
        showToast('Error al guardar la configuración.', 'error');
    }
};
const sendTestTelegram = async (e) => {
    const button = e.target.closest('button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5 mr-2"></i>Enviando...';
    button.disabled = true;
    lucide.createIcons();
    try {
        const sendTestMessage = httpsCallable(functions, 'sendTestTelegramMessage');
        const result = await sendTestMessage();
        showToast(result.data.message, 'success');
    } catch (error) {
        showToast(`Error: ${error.message || "Error desconocido."}`, 'error');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
};

function runKanbanBoardLogic() {
    if (taskState.activeFilter === 'supervision' && !taskState.selectedUserId) {
        renderAdminUserList();
        return;
    }

    let topBarHTML = '';
    if (taskState.selectedUserId) {
        const selectedUser = appState.collections.usuarios.find(u => u.docId === taskState.selectedUserId);
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

    // 1. Set up the basic HTML layout for the board
    dom.viewContent.innerHTML = `
        ${telegramConfigHTML}
        ${topBarHTML}
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 ${taskState.selectedUserId ? 'hidden' : ''}">
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

    // Defer the rest of the setup to ensure the DOM is ready.
    setTimeout(() => {
        // 2. Set up event listeners
        const addNewTaskBtn = document.getElementById('add-new-task-btn');
        if(addNewTaskBtn) addNewTaskBtn.addEventListener('click', () => openTaskFormModal());

        const goToStatsBtn = document.getElementById('go-to-stats-view-btn');
        if(goToStatsBtn) goToStatsBtn.addEventListener('click', renderTaskDashboardView);

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
                taskState.searchTerm = e.target.value.toLowerCase();
                fetchAndRenderTasks();
            });
        }

        const priorityFilter = document.getElementById('task-priority-filter');
        if(priorityFilter) {
            priorityFilter.addEventListener('change', e => {
                taskState.priorityFilter = e.target.value;
                fetchAndRenderTasks();
            });
        }

        setupTaskFilters();

        // 3. Initial fetch and render
        renderTaskFilters();
        fetchAndRenderTasks();

        // 4. Cleanup logic
        appState.currentViewCleanup = () => {
            taskState.unsubscribers.forEach(unsub => unsub());
            taskState.unsubscribers = [];
            taskState.searchTerm = '';
            taskState.priorityFilter = 'all';
            taskState.selectedUserId = null;
        };
    }, 0);
}

export function renderTaskDashboardView() {
    const isAdmin = appState.currentUser.role === 'admin';
    const title = isAdmin ? "Estadísticas del Equipo" : "Mis Estadísticas";
    const subtitle = isAdmin ? "Analiza, filtra y gestiona las tareas del equipo." : "Un resumen de tu carga de trabajo y progreso.";

    // Main layout is the same, but we will hide elements for non-admins
    dom.viewContent.innerHTML = `
    <div class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 class="text-2xl font-bold text-slate-800">${title}</h2>
                <p class="text-sm text-slate-500">${subtitle}</p>
            </div>
            <button data-action="admin-back-to-board" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold flex items-center flex-shrink-0">
                <i data-lucide="arrow-left" class="mr-2 h-5 w-5"></i>
                <span>Volver al Tablero</span>
            </button>
        </div>

        <!-- Global Admin Filters (Admin only) -->
        <div id="admin-filters-container" class="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-6 ${isAdmin ? 'flex' : 'hidden'}">
             <div class="flex items-center gap-2">
                <label for="admin-view-filter" class="text-sm font-bold text-slate-600 flex-shrink-0">Vista:</label>
                <select id="admin-view-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm">
                    <option value="all">Todas las Tareas</option>
                    <option value="my-tasks">Mis Tareas</option>
                </select>
             </div>
             <div id="admin-user-filter-container" class="hidden items-center gap-2">
                <label for="admin-specific-user-filter" class="text-sm font-bold text-slate-600 flex-shrink-0">Usuario:</label>
                <select id="admin-specific-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm">
                    <!-- User options will be populated here -->
                </select>
             </div>
        </div>

        <!-- Tabs Navigation (Admin only) -->
        <div id="admin-tabs-container" class="border-b border-gray-200 ${isAdmin ? 'block' : 'hidden'}">
            <nav id="admin-task-tabs" class="-mb-px flex space-x-6" aria-label="Tabs">
                <button data-tab="dashboard" class="admin-task-tab active-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="layout-dashboard" class="mr-2"></i><span>Dashboard</span>
                </button>
                <button data-tab="calendar" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="calendar-days" class="mr-2"></i><span>Calendario</span>
                </button>
                <button data-tab="table" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="table" class="mr-2"></i><span>Tabla de Tareas</span>
                </button>
            </nav>
        </div>

        <div class="animate-fade-in-up">
            <!-- Tab Panels -->
            <div id="admin-tab-content">
                <!-- Dashboard Panel (Always visible) -->
                <div id="tab-panel-dashboard" class="admin-tab-panel">
                    <div id="task-charts-container" class="flex flex-col gap-6">
                        <!-- First row for the two smaller charts -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Estado</h3><div class="relative h-64"><canvas id="status-chart"></canvas></div></div>
                            <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Prioridad</h3><div class="relative h-64"><canvas id="priority-chart"></canvas></div></div>
                        </div>
                        <!-- Second row for the full-width chart -->
                        <div id="user-load-chart-wrapper" class="bg-white p-6 rounded-xl shadow-lg ${isAdmin ? 'block' : 'hidden'}">
                            <h3 class="text-lg font-bold text-slate-800 mb-4">Carga por Usuario (Tareas Abiertas)</h3>
                            <div class="relative h-80"><canvas id="user-load-chart"></canvas></div>
                        </div>
                    </div>
                </div>

                <!-- Calendar Panel (Admin only) -->
                <div id="tab-panel-calendar" class="admin-tab-panel hidden">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <div id="calendar-header" class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                            <div class="flex items-center gap-4">
                                <button id="prev-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-left" class="h-6 w-6"></i></button>
                                <h3 id="calendar-title" class="text-2xl font-bold text-slate-800 text-center w-48"></h3>
                                <button id="next-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-right" class="h-6 w-6"></i></button>
                                <button id="today-calendar-btn" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Hoy</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <select id="calendar-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                                    <option value="all">Prioridad (todas)</option>
                                    <option value="high">Alta</option>
                                    <option value="medium">Media</option>
                                    <option value="low">Baja</option>
                                </select>
                                <div class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                                    <button data-view="monthly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Mensual</button>
                                    <button data-view="weekly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Semanal</button>
                                </div>
                            </div>
                        </div>
                        <div id="calendar-grid" class="mt-6">
                            <!-- Calendar will be rendered here -->
                        </div>
                    </div>
                </div>

                <!-- Table Panel (Admin only) -->
                <div id="tab-panel-table" class="admin-tab-panel hidden">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <div id="task-table-controls" class="flex flex-col md:flex-row gap-4 mb-4">
                            <div class="relative flex-grow"><i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i><input type="text" id="admin-task-search" placeholder="Buscar por título..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-slate-50 focus:bg-white"></div>
                            <div class="flex items-center gap-4 flex-wrap">
                                <select id="admin-task-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todos los usuarios</option></select>
                                <select id="admin-task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todas las prioridades</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select>
                                <select id="admin-task-status-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white">
                                    <option value="active">Activas</option>
                                    <option value="all">Todos los estados</option>
                                    <option value="todo">Por Hacer</option>
                                    <option value="inprogress">En Progreso</option>
                                    <option value="done">Completada</option>
                                </select>
                            </div>
                            <button id="add-new-task-admin-btn" class="bg-blue-600 text-white px-5 py-2 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105 flex-shrink-0"><i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea</button>
                        </div>
                        <div id="task-data-table-container" class="overflow-x-auto"><p class="text-center py-16 text-slate-500 flex items-center justify-center gap-3"><i data-lucide="loader" class="h-6 w-6 animate-spin"></i>Cargando tabla de tareas...</p></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    lucide.createIcons();

    // Tab switching logic for admins
    if (isAdmin) {
        const tabs = document.querySelectorAll('.admin-task-tab');
        const panels = document.querySelectorAll('.admin-tab-panel');

        document.getElementById('admin-task-tabs').addEventListener('click', (e) => {
            const tabButton = e.target.closest('.admin-task-tab');
            if (!tabButton) return;

            const tabName = tabButton.dataset.tab;

            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
            });
            tabButton.classList.add('active-tab');

            panels.forEach(panel => {
                if (panel.id === `tab-panel-${tabName}`) {
                    panel.classList.remove('hidden');
                } else {
                    panel.classList.add('hidden');
                }
            });
        });
    }

    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const q = query(tasksRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        // Defer rendering to prevent race conditions, ensuring the DOM is ready.
        setTimeout(() => {
            if(isAdmin) {
                adminTaskViewState.tasks = allTasks;
                updateAdminDashboardData(allTasks);
            } else {
                const myTasks = allTasks.filter(t => t.assigneeUid === appState.currentUser.uid || t.creatorUid === appState.currentUser.uid);
                renderAdminTaskCharts(myTasks); // Directly render charts with user's tasks
            }
        }, 0);
    }, (error) => {
        console.error("Error fetching tasks for dashboard:", error);
        showToast('Error al cargar las tareas del dashboard.', 'error');
    });

    // Initial render of components for admins
    if(isAdmin) {
        renderCalendar(); // Initialize the calendar structure once
        setupAdminTaskViewListeners();
        updateAdminDashboardData([]); // Initial call with empty data to render skeletons
    }

    appState.currentViewCleanup = () => {
        unsubscribe();
        destroyAdminTaskCharts();
        adminTaskViewState = {
            tasks: [],
            filters: { searchTerm: '', user: 'all', priority: 'all', status: 'all' },
            sort: { by: 'createdAt', order: 'desc' },
            pagination: { currentPage: 1, pageSize: 10 },
            calendar: {
                currentDate: new Date(),
                view: 'monthly' // 'monthly' or 'weekly'
            }
        };
    };
}

function updateAdminDashboardData(tasks) {
    let filteredTasks = [...tasks];
    const { viewMode } = adminTaskViewState;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all') {
        // A specific user's UID is selected
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode);
    }

    // The components below will use the globally filtered task list
    renderAdminTaskCharts(filteredTasks);
    renderCalendar(adminTaskViewState.calendar.currentDate, adminTaskViewState.calendar.view);


    // This function has its own internal filtering based on table controls
    renderFilteredAdminTaskTable();
}

function destroyAdminTaskCharts() {
    Object.keys(adminCharts).forEach(key => {
        if (adminCharts[key]) {
            adminCharts[key].destroy();
            adminCharts[key] = null;
        }
    });
}

function renderAdminTaskCharts(tasks) {
    destroyAdminTaskCharts();
    renderStatusChart(tasks);
    renderPriorityChart(tasks);
    renderUserLoadChart(tasks);
}

function renderStatusChart(tasks) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const statusCounts = activeTasks.reduce((acc, task) => {
        const status = task.status || 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { todo: 0, inprogress: 0 });

    adminCharts.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Por Hacer', 'En Progreso'],
            datasets: [{
                data: [statusCounts.todo, statusCounts.inprogress],
                backgroundColor: ['#f59e0b', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderPriorityChart(tasks) {
    const ctx = document.getElementById('priority-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const priorityCounts = activeTasks.reduce((acc, task) => {
        const priority = task.priority || 'medium';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { low: 0, medium: 0, high: 0 });

    adminCharts.priorityChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Baja', 'Media', 'Alta'],
            datasets: [{
                data: [priorityCounts.low, priorityCounts.medium, priorityCounts.high],
                backgroundColor: ['#6b7280', '#f59e0b', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderUserLoadChart(tasks) {
    const ctx = document.getElementById('user-load-chart')?.getContext('2d');
    if (!ctx) return;

    const openTasks = tasks.filter(t => t.status !== 'done');
    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    const labels = Object.keys(userTaskCounts).map(uid => userMap.get(uid)?.name || 'No Asignado');
    const data = Object.values(userTaskCounts);

    adminCharts.userLoadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tareas Abiertas',
                data: data,
                backgroundColor: '#3b82f6',
                borderColor: '#1d4ed8',
                borderWidth: 1,
                maxBarThickness: data.length < 3 ? 50 : undefined
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function setupAdminTaskViewListeners() {
    const controls = {
        // Main view filters
        viewFilter: document.getElementById('admin-view-filter'),
        specificUserFilter: document.getElementById('admin-specific-user-filter'),
        specificUserContainer: document.getElementById('admin-user-filter-container'),
        // Table-specific filters
        search: document.getElementById('admin-task-search'),
        user: document.getElementById('admin-task-user-filter'),
        priority: document.getElementById('admin-task-priority-filter'),
        status: document.getElementById('admin-task-status-filter'),
        addNew: document.getElementById('add-new-task-admin-btn'),
        tableContainer: document.getElementById('task-data-table-container'),
        // Timeline filters are removed, so no controls to declare.
    };

    if (!controls.viewFilter) return; // Exit if the main controls aren't rendered

    // --- Populate User Dropdowns ---
    const users = appState.collections.usuarios || [];
    const userOptionsHTML = users.map(u => `<option value="${u.docId}">${u.name || u.email}</option>`).join('');
    controls.specificUserFilter.innerHTML = userOptionsHTML;
    // Add a "Select a user" prompt
    controls.specificUserFilter.insertAdjacentHTML('afterbegin', '<option value="" disabled selected>Seleccionar usuario...</option>');
    controls.user.innerHTML = '<option value="all">Todos los asignados</option>' + userOptionsHTML;

    // --- Main View Filter Logic ---
    controls.viewFilter.addEventListener('change', (e) => {
        const selection = e.target.value;
        if (selection === 'all' || selection === 'my-tasks') {
            controls.specificUserContainer.classList.add('hidden');
            adminTaskViewState.viewMode = selection;
            updateAdminDashboardData(adminTaskViewState.tasks);
        } else {
             // This logic can be extended if more options are added
        }
    });

    // Add a specific option to trigger user selection
    if(!controls.viewFilter.querySelector('option[value="specific-user"]')) {
        controls.viewFilter.insertAdjacentHTML('beforeend', '<option value="specific-user">Usuario específico...</option>');
    }

    controls.viewFilter.addEventListener('change', (e) => {
        if (e.target.value === 'specific-user') {
            controls.specificUserContainer.classList.remove('hidden');
        } else {
            controls.specificUserContainer.classList.add('hidden');
            adminTaskViewState.viewMode = e.target.value;
            updateAdminDashboardData(adminTaskViewState.tasks);
        }
    });

    controls.specificUserFilter.addEventListener('change', (e) => {
        adminTaskViewState.viewMode = e.target.value;
        updateAdminDashboardData(adminTaskViewState.tasks);
    });


    // --- Table Filter Logic ---
    const rerenderTable = () => {
        adminTaskViewState.pagination.currentPage = 1;
        renderFilteredAdminTaskTable();
    };

    controls.search.addEventListener('input', (e) => { adminTaskViewState.filters.searchTerm = e.target.value.toLowerCase(); rerenderTable(); });
    controls.user.addEventListener('change', (e) => { adminTaskViewState.filters.user = e.target.value; rerenderTable(); });
    controls.priority.addEventListener('change', (e) => { adminTaskViewState.filters.priority = e.target.value; rerenderTable(); });
    controls.status.addEventListener('change', (e) => { adminTaskViewState.filters.status = e.target.value; rerenderTable(); });
    controls.addNew.addEventListener('click', () => openTaskFormModal(null, 'todo'));

    // --- Table-specific Click Logic ---
    controls.tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th[data-sort]');
        if (header) {
            const sortBy = header.dataset.sort;
            if (adminTaskViewState.sort.by === sortBy) {
                adminTaskViewState.sort.order = adminTaskViewState.sort.order === 'asc' ? 'desc' : 'asc';
            } else {
                adminTaskViewState.sort.by = sortBy;
                adminTaskViewState.sort.order = 'asc';
            }
            rerenderTable();
            return;
        }

        const actionButton = e.target.closest('button[data-action]');
        if (actionButton) {
            const action = actionButton.dataset.action;
            const taskId = actionButton.dataset.docId;
            const task = adminTaskViewState.tasks.find(t => t.docId === taskId);

            if (action === 'edit-task' && task) {
                openTaskFormModal(task);
            } else if (action === 'delete-task' && task) {
                 showConfirmationModal('Eliminar Tarea',`¿Estás seguro de que deseas eliminar la tarea "${task.title}"?`,() => deleteDocument(COLLECTIONS.TAREAS, taskId));
            }
        }

        const pageButton = e.target.closest('button[data-page]');
        if (pageButton) {
            adminTaskViewState.pagination.currentPage = parseInt(pageButton.dataset.page, 10);
            renderFilteredAdminTaskTable();
        }
    });

    // --- Calendar Controls Logic ---
    const calendarControls = {
        prevBtn: document.getElementById('prev-calendar-btn'),
        nextBtn: document.getElementById('next-calendar-btn'),
        todayBtn: document.getElementById('today-calendar-btn'),
        viewBtns: document.querySelectorAll('.calendar-view-btn')
    };

    if (calendarControls.prevBtn) {
        calendarControls.prevBtn.addEventListener('click', () => {
            const date = adminTaskViewState.calendar.currentDate;
            if (adminTaskViewState.calendar.view === 'monthly') {
                date.setMonth(date.getMonth() - 1);
            } else {
                date.setDate(date.getDate() - 7);
            }
            renderCalendar(date, adminTaskViewState.calendar.view);
        });

        calendarControls.nextBtn.addEventListener('click', () => {
            const date = adminTaskViewState.calendar.currentDate;
            if (adminTaskViewState.calendar.view === 'monthly') {
                date.setMonth(date.getMonth() + 1);
            } else {
                date.setDate(date.getDate() + 7);
            }
            renderCalendar(date, adminTaskViewState.calendar.view);
        });

        calendarControls.todayBtn.addEventListener('click', () => {
            renderCalendar(new Date(), adminTaskViewState.calendar.view);
        });

        calendarControls.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                renderCalendar(adminTaskViewState.calendar.currentDate, view);
            });
        });

        const calendarPriorityFilter = document.getElementById('calendar-priority-filter');
        if(calendarPriorityFilter) {
            calendarPriorityFilter.addEventListener('change', (e) => {
                adminTaskViewState.filters.priority = e.target.value;
                renderCalendar(adminTaskViewState.calendar.currentDate, adminTaskViewState.calendar.view);
            });
        }

        const calendarGrid = document.getElementById('calendar-grid');
        if (calendarGrid) {
            calendarGrid.addEventListener('click', (e) => {
                if (e.target.closest('[data-task-id]')) {
                    return;
                }
                const dayCell = e.target.closest('.relative.p-2');
                if (dayCell) {
                    const taskList = dayCell.querySelector('.task-list[data-date]');
                    if (taskList) {
                        const dateStr = taskList.dataset.date;
                        openTaskFormModal(null, 'todo', null, dateStr);
                    }
                }
            });
        }
    }
}

function renderFilteredAdminTaskTable() {
    let filteredTasks = [...adminTaskViewState.tasks];
    const { searchTerm, user, priority, status } = adminTaskViewState.filters;

    if (searchTerm) filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.description && t.description.toLowerCase().includes(searchTerm)));
    if (user !== 'all') filteredTasks = filteredTasks.filter(t => t.assigneeUid === user);
    if (priority !== 'all') filteredTasks = filteredTasks.filter(t => (t.priority || 'medium') === priority);
    if (status === 'active') {
        filteredTasks = filteredTasks.filter(t => t.status !== 'done');
    } else if (status !== 'all') {
        filteredTasks = filteredTasks.filter(t => (t.status || 'todo') === status);
    }

    const { by, order } = adminTaskViewState.sort;
    filteredTasks.sort((a, b) => {
        let valA = a[by] || '';
        let valB = b[by] || '';

        if (by === 'dueDate' || by === 'createdAt') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    renderAdminTaskTable(filteredTasks);
}

function renderAdminTaskTable(tasksToRender) {
    const container = document.getElementById('task-data-table-container');
    if (!container) return;

    const { currentPage, pageSize } = adminTaskViewState.pagination;
    const totalPages = Math.ceil(tasksToRender.length / pageSize);
    if (currentPage > totalPages && totalPages > 0) adminTaskViewState.pagination.currentPage = totalPages;
    const paginatedTasks = tasksToRender.slice((adminTaskViewState.pagination.currentPage - 1) * pageSize, adminTaskViewState.pagination.currentPage * pageSize);

    const userMap = appState.collectionsById.usuarios;
    const priorityMap = { high: 'Alta', medium: 'Media', low: 'Baja' };
    const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };
    const priorityColorMap = { high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-slate-100 text-slate-800'};
    const statusColorMap = { todo: 'bg-yellow-100 text-yellow-800', inprogress: 'bg-blue-100 text-blue-800', done: 'bg-green-100 text-green-800'};

    const getSortIndicator = (column) => {
        if (adminTaskViewState.sort.by === column) {
            return adminTaskViewState.sort.order === 'asc' ? '▲' : '▼';
        }
        return '';
    };

    let tableHTML = `<table class="w-full text-sm text-left text-gray-600">
        <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="title">Tarea ${getSortIndicator('title')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="assigneeUid">Asignado a ${getSortIndicator('assigneeUid')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="priority">Prioridad ${getSortIndicator('priority')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="dueDate">Fecha Límite ${getSortIndicator('dueDate')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="status">Estado ${getSortIndicator('status')}</th>
            <th scope="col" class="px-6 py-3 text-right">Acciones</th>
        </tr></thead><tbody>`;

    if (paginatedTasks.length === 0) {
        tableHTML += `<tr><td colspan="6" class="text-center py-16 text-gray-500"><div class="flex flex-col items-center gap-3"><i data-lucide="search-x" class="w-12 h-12 text-gray-300"></i><h4 class="font-semibold">No se encontraron tareas</h4><p>Intente ajustar los filtros de búsqueda.</p></div></td></tr>`;
    } else {
        paginatedTasks.forEach(task => {
            const assignee = userMap.get(task.assigneeUid);
            const assigneeName = assignee ? assignee.name : '<span class="italic text-slate-400">No asignado</span>';
            const priority = task.priority || 'medium';
            const status = task.status || 'todo';
            const dueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';

            tableHTML += `<tr class="bg-white border-b hover:bg-gray-50">
                <td class="px-6 py-4 font-medium text-gray-900">${task.title}</td>
                <td class="px-6 py-4">${assigneeName}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${priorityColorMap[priority]}">${priorityMap[priority]}</span></td>
                <td class="px-6 py-4">${dueDate}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColorMap[status]}">${statusMap[status]}</span></td>
                <td class="px-6 py-4 text-right">
                    <button data-action="edit-task" data-doc-id="${task.docId}" class="p-2 text-gray-500 hover:text-blue-600"><i data-lucide="edit" class="h-4 w-4 pointer-events-none"></i></button>
                    <button data-action="delete-task" data-doc-id="${task.docId}" class="p-2 text-gray-500 hover:text-red-600"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                </td>
            </tr>`;
        });
    }
    tableHTML += `</tbody></table>`;

    if(totalPages > 1) {
        tableHTML += `<div class="flex justify-between items-center pt-4">`;
        tableHTML += `<button data-page="${currentPage - 1}" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
        tableHTML += `<span class="text-sm font-semibold text-gray-600">Página ${currentPage} de ${totalPages}</span>`;
        tableHTML += `<button data-page="${currentPage + 1}" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>`;
        tableHTML += `</div>`;
    }

    container.innerHTML = tableHTML;
    lucide.createIcons();
}

// =================================================================================
// --- 8. LÓGICA DEL CALENDARIO ---
// =================================================================================
// Helper para obtener el número de la semana ISO 8601.
Date.prototype.getWeekNumber = function() {
  var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
};

function renderCalendar(date, view) {
    if (!adminTaskViewState.calendar) return; // Don't render if state is not ready

    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    if (!calendarGrid || !calendarTitle) return;

    const aDate = date || adminTaskViewState.calendar.currentDate;
    const aView = view || adminTaskViewState.calendar.view;

    adminTaskViewState.calendar.currentDate = aDate;
    adminTaskViewState.calendar.view = aView;

    // Update view switcher buttons UI
    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        if (btn.dataset.view === aView) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
        }
    });

    if (aView === 'monthly') {
        renderMonthlyView(aDate);
    } else { // weekly
        renderWeeklyView(aDate);
    }

    // After rendering the grid, display tasks
    displayTasksOnCalendar(adminTaskViewState.tasks);
}

export function initTasksModule(dependencies) {
    db = dependencies.db;
    functions = dependencies.functions;
    appState = dependencies.appState;
    dom = dependencies.dom;
    showToast = dependencies.showToast;
    showConfirmationModal = dependencies.showConfirmationModal;
    switchView = dependencies.switchView;
    checkUserPermission = dependencies.checkUserPermission;
    lucide = dependencies.lucide;
    console.log("Tasks module initialized.");
}

export function runTasksLogic() {
    runKanbanBoardLogic();
}

function renderMonthlyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    const year = date.getFullYear();
    const month = date.getMonth();

    calendarTitle.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

    let html = `
        <div class="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Sem</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Lunes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Martes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Miércoles</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Jueves</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Viernes</div>
    `;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let currentDate = new Date(firstDayOfMonth);
    let dayOfWeek = currentDate.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    currentDate.setDate(currentDate.getDate() - dateOffset);

    let weekHasContent = true;
    while(weekHasContent) {
        let weekNumber = currentDate.getWeekNumber();
        html += `<div class="bg-slate-100 text-center p-2 font-bold text-slate-500 text-sm flex items-center justify-center">${weekNumber}</div>`;

        let daysInThisWeekFromMonth = 0;
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const dayClass = (currentDate.getMonth() === month) ? 'bg-white' : 'bg-slate-50 text-slate-400';
            const dateStr = currentDate.toISOString().split('T')[0];
            html += `
                <div class="relative p-2 min-h-[120px] ${dayClass}">
                    <time datetime="${dateStr}" class="font-semibold text-sm">${currentDate.getDate()}</time>
                    <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
                </div>
            `;
            if (currentDate.getMonth() === month) {
                daysInThisWeekFromMonth++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        currentDate.setDate(currentDate.getDate() + 2);

        if (daysInThisWeekFromMonth === 0 && currentDate > lastDayOfMonth) {
            weekHasContent = false;
        }
    }

    html += `</div>`;
    calendarGrid.innerHTML = html;
}

function renderWeeklyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    let dayOfWeek = date.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    let monday = new Date(date);
    monday.setDate(date.getDate() - dateOffset);

    let friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const weekNumber = monday.getWeekNumber();
    calendarTitle.textContent = `Semana ${weekNumber}`;

    const dayHeaders = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    let headerHtml = '';
    for(let i=0; i<5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        headerHtml += `<div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">${dayHeaders[i]} ${d.getDate()}</div>`;
    }

    let html = `
        <div class="grid grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            ${headerHtml}
    `;

    for (let i = 0; i < 5; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        html += `
            <div class="relative bg-white p-2 min-h-[200px]">
                <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
            </div>
        `;
    }

    html += `</div>`;
    calendarGrid.innerHTML = html;
}

function displayTasksOnCalendar(tasks) {
    // Clear any existing tasks from the calendar
    document.querySelectorAll('#calendar-grid .task-list').forEach(list => {
        list.innerHTML = '';
    });

    if (!tasks) return;

    const tasksToDisplay = tasks.filter(task => {
        const { priority } = adminTaskViewState.filters;
        if (priority !== 'all' && (task.priority || 'medium') !== priority) {
            return false;
        }
        return true;
    });

    tasksToDisplay.forEach(task => {
        if (task.dueDate) {
            const taskDateStr = task.dueDate;
            const dayCell = document.querySelector(`#calendar-grid .task-list[data-date="${taskDateStr}"]`);

            if (dayCell) {
                const priorityClasses = {
                    high: 'bg-red-100 border-l-4 border-red-500 text-red-800',
                    medium: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800',
                    low: 'bg-slate-100 border-l-4 border-slate-500 text-slate-800',
                };
                const priority = task.priority || 'medium';

                const taskElement = document.createElement('div');
                taskElement.className = `p-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 truncate ${priorityClasses[priority]}`;
                taskElement.textContent = task.title;
                taskElement.title = task.title;
                taskElement.dataset.taskId = task.docId;

                taskElement.addEventListener('click', () => {
                    openTaskFormModal(task);
                });

                dayCell.appendChild(taskElement);
            }
        }
    });
}

/**
 * @file Manages the task creation and editing modal.
 */

import { collection, onSnapshot, query, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { checkUserPermission, showConfirmationModal, showToast } from '../../main.js';
import { getState } from './task.state.js';
import { handleTaskFormSubmit, deleteTask, createTask, fetchAllTasks } from './task.service.js';
import { getTaskFormModalHTML, getSubtaskHTML, getMultiTaskConfirmationHTML, getAICreationModalHTML } from './task.templates.js';

let appState;
let dom;
let lucide;
let db;

export function initTaskModal(dependencies) {
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    db = dependencies.db;
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

function initSubtasks(modalElement, task) {
    const subtaskListEl = modalElement.querySelector('#subtasks-list');
    const newSubtaskInput = modalElement.querySelector('#new-subtask-title');
    const isEditing = task !== null;
    let currentSubtasks = isEditing && task.subtasks ? [...task.subtasks] : [];

    const rerenderSubtasks = () => {
        subtaskListEl.innerHTML = currentSubtasks.map(getSubtaskHTML).join('') || '<p class="text-xs text-center text-slate-400 py-2">No hay sub-tareas.</p>';
        modalElement.dataset.subtasks = JSON.stringify(currentSubtasks);
        lucide.createIcons();
    };

    const addSubtask = (title) => {
        if (title) {
            currentSubtasks.push({
                id: `sub_${Date.now()}`,
                title: title,
                completed: false
            });
            rerenderSubtasks();
        }
    };

    const setSubtasks = (titles) => {
        currentSubtasks = titles.map(title => ({
            id: `sub_${Date.now()}_${Math.random()}`,
            title: title,
            completed: false
        }));
        rerenderSubtasks();
    };

    newSubtaskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const title = newSubtaskInput.value.trim();
            addSubtask(title);
            newSubtaskInput.value = '';
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

    return { addSubtask, setSubtasks };
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

function initComments(modalElement, task) {
    const commentsListEl = modalElement.querySelector('#task-comments-list');
    const newCommentInput = modalElement.querySelector('#new-task-comment');
    const postCommentBtn = modalElement.querySelector('#post-comment-btn');
    const isEditing = task !== null;
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
                <div class="flex items-start gap-3 mb-3">
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
        }, (error) => {
            console.error("Error fetching comments: ", error);
            renderTaskComments([]);
        });
    } else {
        renderTaskComments([]);
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

    return commentsUnsubscribe;
}

function initModalEventListeners(modalElement, task, commentsUnsubscribe) {
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

export function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;
    const isAdmin = appState.currentUser.role === 'admin';

    let selectedUid = defaultAssigneeUid || '';
    if (!selectedUid) {
        if (isEditing && task.assigneeUid) {
            selectedUid = task.assigneeUid;
        } else if (!isEditing && getState().kanban.activeFilter === 'personal') {
            selectedUid = appState.currentUser.uid;
        }
    }

    // If user is not an admin, they can only create/edit tasks for themselves.
    if (!isAdmin) {
        selectedUid = appState.currentUser.uid;
    }

    const modalHTML = getTaskFormModalHTML(task, defaultStatus, selectedUid, defaultDate, isAdmin);
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById('task-form-modal');

    populateTaskAssigneeDropdown();

    // Also disable the dropdown just in case the template doesn't.
    if (!isAdmin) {
        const assigneeSelect = modalElement.querySelector('#task-assignee');
        if (assigneeSelect) {
            assigneeSelect.disabled = true;
        }
    }

    const subtaskManager = initSubtasks(modalElement, task);
    const commentsUnsubscribe = initComments(modalElement, task);
    initModalEventListeners(modalElement, task, commentsUnsubscribe);

    const organizeWithAiBtn = modalElement.querySelector('#organize-with-ai-btn');
    organizeWithAiBtn.addEventListener('click', async () => {
        const brainDumpText = modalElement.querySelector('#task-ai-braindump').value;
        if (!brainDumpText.trim()) {
            showToast('Por favor, introduce el texto de la tarea a organizar.', 'warning');
            return;
        }

        organizeWithAiBtn.disabled = true;
        organizeWithAiBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 mr-2 animate-spin"></i> Organizando...';
        lucide.createIcons();

        try {
            const functions = getFunctions();
            const organizeTaskWithAI = httpsCallable(functions, 'organizeTaskWithAI');
            const result = await organizeTaskWithAI({ text: brainDumpText });
            const suggestedTasks = result.data.tasks;

            if (suggestedTasks && suggestedTasks.length === 1) {
                const taskData = suggestedTasks[0];
                const { title, description, subtasks, priority, dueDate, startDate, assignee, isPublic } = taskData;

                modalElement.querySelector('#task-title').value = title || '';
                modalElement.querySelector('#task-description').value = description || '';
                subtaskManager.setSubtasks(subtasks || []);

                if (priority) {
                    modalElement.querySelector('#task-priority').value = priority;
                }

                if (startDate) {
                    modalElement.querySelector('#task-startdate').value = startDate;
                } else {
                    const today = new Date().toISOString().split('T')[0];
                    modalElement.querySelector('#task-startdate').value = today;
                }

                if (dueDate) {
                    modalElement.querySelector('#task-duedate').value = dueDate;
                }

                if (isPublic !== undefined) {
                    const isPublicCheckbox = modalElement.querySelector('#task-is-public');
                    if (isPublicCheckbox) {
                        isPublicCheckbox.checked = isPublic;
                    }
                }

                if (assignee) {
                    const assigneeSelect = modalElement.querySelector('#task-assignee');
                    const users = appState.collections.usuarios || [];
                    const foundUser = users.find(u => u.name.toLowerCase().includes(assignee.toLowerCase()));
                    if (foundUser) {
                        assigneeSelect.value = foundUser.docId;
                    } else {
                        showToast(`Sugerencia: No se pudo encontrar un usuario llamado "${assignee}".`, 'info');
                    }
                }
                showToast('¡Tarea organizada con IA!', 'success');

            } else if (suggestedTasks && suggestedTasks.length > 1) {
                const modalContentContainer = modalElement.querySelector('#task-modal-content-container');
                if (!modalContentContainer) {
                    showToast('Error: No se pudo encontrar el contenedor del modal.', 'error');
                    return;
                }

                // Make the modal resizable and clean its content
                modalContentContainer.style.maxHeight = 'none';
                modalContentContainer.innerHTML = ''; // Clear previous content (header, form, footer)

                // Render the new confirmation view
                const confirmationHTML = getMultiTaskConfirmationHTML(suggestedTasks);
                modalContentContainer.innerHTML = confirmationHTML;
                lucide.createIcons();

                const confirmationView = modalElement.querySelector('#multi-task-confirmation-view');
                if (!confirmationView) return;

                confirmationView.querySelector('#cancel-multi-task-btn').addEventListener('click', () => {
                    modalElement.remove();
                });

                confirmationView.querySelector('#create-selected-tasks-btn').addEventListener('click', async (e) => {
                    const createBtn = e.currentTarget;
                    createBtn.disabled = true;
                    createBtn.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5"></i> Creando...';
                    lucide.createIcons({ nodes: [createBtn.querySelector('i')] });

                    const selectedTasks = [];
                    const checkboxes = confirmationView.querySelectorAll('.suggested-task-checkbox:checked');
                    checkboxes.forEach(cb => {
                        const taskIndex = parseInt(cb.dataset.taskIndex, 10);
                        selectedTasks.push(suggestedTasks[taskIndex]);
                    });

                    if (selectedTasks.length === 0) {
                        showToast('No se ha seleccionado ninguna tarea para crear.', 'warning');
                        createBtn.disabled = false;
                        createBtn.innerHTML = 'Crear Tareas Seleccionadas';
                        return;
                    }

                    let successCount = 0;
                    for (const task of selectedTasks) {
                        const success = await createTask(task);
                        if (success) {
                            successCount++;
                        }
                    }

                    showToast(`${successCount} de ${selectedTasks.length} tareas creadas con éxito.`, 'success');
                    modalElement.remove();
                });

            } else {
                throw new Error("La respuesta de la IA no contenía un array de tareas válido.");
            }

        } catch (error) {
            console.error("Error calling organizeTaskWithAI function:", error);
            showToast(error.message || 'Ocurrió un error al contactar a la IA.', 'error');
        } finally {
            organizeWithAiBtn.disabled = false;
            organizeWithAiBtn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4 mr-2"></i> Organizar Tarea';
            lucide.createIcons();
        }
    });

    if (!isEditing) {
        modalElement.querySelector('#task-ai-braindump').focus();
    }
}

export async function openAICreationModal() {
    const modalHTML = getAICreationModalHTML();
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById('ai-creation-modal');
    const modalContent = document.getElementById('ai-creation-modal-content');
    const promptView = document.getElementById('ai-prompt-view');
    const reviewView = document.getElementById('ai-review-view');
    const promptTextarea = document.getElementById('ai-prompt-textarea');
    const generateBtn = document.getElementById('ai-generate-tasks-btn');

    const closeModal = () => modalElement.remove();

    modalElement.querySelectorAll('[data-action="close"]').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    generateBtn.addEventListener('click', async () => {
        const promptText = promptTextarea.value.trim();
        if (!promptText) {
            showToast('Por favor, describe las tareas que necesitas crear.', 'warning');
            return;
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5"></i> Analizando...';
        lucide.createIcons();

        try {
            // Fetch user's tasks to provide context to the AI
            const allTasks = await fetchAllTasks();
            const userTasks = allTasks.filter(task => task.assigneeUid === appState.currentUser.uid && task.status !== 'done');

            const functions = getFunctions();
            const organizeTaskWithAI = httpsCallable(functions, 'organizeTaskWithAI');
            const result = await organizeTaskWithAI({ text: promptText, userTasks });
            const suggestedTasks = result.data.tasks;

            if (!suggestedTasks || suggestedTasks.length === 0) {
                throw new Error("La IA no pudo generar ninguna tarea a partir de tu petición.");
            }

            promptView.classList.add('hidden');
            reviewView.innerHTML = getMultiTaskConfirmationHTML(suggestedTasks);
            reviewView.classList.remove('hidden');
            lucide.createIcons();

            reviewView.querySelector('#cancel-multi-task-btn').addEventListener('click', closeModal);

            reviewView.querySelector('#create-selected-tasks-btn').addEventListener('click', async (e) => {
                const createBtn = e.currentTarget;
                createBtn.disabled = true;
                createBtn.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5"></i> Creando...';
                lucide.createIcons();

                const selectedTasks = [];
                const checkboxes = reviewView.querySelectorAll('.suggested-task-checkbox:checked');
                checkboxes.forEach(cb => {
                    const taskIndex = parseInt(cb.dataset.taskIndex, 10);
                    selectedTasks.push(suggestedTasks[taskIndex]);
                });

                if (selectedTasks.length === 0) {
                    showToast('No se ha seleccionado ninguna tarea para crear.', 'warning');
                    createBtn.disabled = false;
                    createBtn.innerHTML = 'Crear Tareas Seleccionadas';
                    return;
                }

                let successCount = 0;
                for (const task of selectedTasks) {
                    const success = await createTask(task);
                    if (success) successCount++;
                }

                showToast(`${successCount} de ${selectedTasks.length} tareas creadas con éxito.`, 'success');
                closeModal();
            });


        } catch (error) {
            console.error("Error calling organizeTaskWithAI function:", error);
            showToast(error.message || 'Ocurrió un error al contactar a la IA.', 'error');
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i data-lucide="brain-circuit" class="w-5 h-5"></i> Analizar y Generar Tareas';
            lucide.createIcons();
        }
    });

    promptTextarea.focus();
}

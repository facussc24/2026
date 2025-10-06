import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../utils.js';
import {
    getTaskFormModalHTML,
    getSubtaskHTML,
    getAIChatModalHTML,
    getAIChatMessageHTML,
    getAILoadingMessageHTML,
    getAIAssistantReviewViewHTML,
    getAIAssistantExecutionProgressViewHTML,
    getPlannerHelpModalHTML,
    getTasksModalHTML
} from './landing_page.tasks.templates.js';

let db;
let functions;
let appState;
let dom;
let lucide;
let showToast;
let showConfirmationModal;

export function initLandingTasksHelper(dependencies) {
    db = dependencies.db;
    functions = dependencies.functions;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    showToast = dependencies.showToast;
    showConfirmationModal = dependencies.showConfirmationModal;
}

function getUsersArray() {
    if (Array.isArray(appState?.collections?.usuarios)) {
        return appState.collections.usuarios;
    }
    if (appState?.collectionsById?.usuarios instanceof Map) {
        return Array.from(appState.collectionsById.usuarios.values());
    }
    return [];
}

function getUsersMap() {
    if (appState?.collectionsById?.usuarios instanceof Map) {
        return appState.collectionsById.usuarios;
    }
    const map = new Map();
    getUsersArray().forEach(user => {
        if (user?.docId) {
            map.set(user.docId, user);
        }
    });
    return map;
}

function populateTaskAssigneeDropdown() {
    const select = document.getElementById('task-assignee');
    if (!select) return;

    const users = getUsersArray();
    if (!users || users.length === 0) {
        select.innerHTML = '<option value="">No hay usuarios</option>';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    const selectedUid = select.dataset.selectedUid;

    const options = users
        .filter(u => u && u.disabled !== true)
        .map(u => {
            const displayName = u.name || (u.email ? u.email.split('@')[0] : 'Usuario');
            return `<option value="${u.docId}">${displayName}</option>`;
        }).join('');

    select.innerHTML = `<option value="">No asignada</option>${options}`;

    if (selectedUid) {
        select.value = selectedUid;
    }
}

function initSubtasks(modalElement, task) {
    const subtaskListEl = modalElement.querySelector('#subtasks-list');
    const newSubtaskInput = modalElement.querySelector('#new-subtask-title');
    const isEditing = task !== null;
    let currentSubtasks = isEditing && Array.isArray(task.subtasks) ? [...task.subtasks] : [];

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

    newSubtaskInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const title = newSubtaskInput.value.trim();
            addSubtask(title);
            newSubtaskInput.value = '';
        }
    });

    subtaskListEl?.addEventListener('click', e => {
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

    rerenderSubtasks();

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
        if (!comments || comments.length === 0) {
            commentsListEl.innerHTML = '<p class="text-xs text-center text-slate-400 py-2">No hay comentarios todavía.</p>';
            return;
        }
        const usersMap = getUsersMap();
        commentsListEl.innerHTML = comments.map(comment => {
            const author = usersMap.get(comment.creatorUid) || { name: 'Usuario Desconocido', photoURL: '' };
            const timestamp = comment.createdAt?.toDate ? formatTimeAgo(comment.createdAt.toDate()) : 'hace un momento';
            const avatar = author.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(author.name || 'Usuario')}`;
            return `
                <div class="flex items-start gap-3 mb-3">
                    <img src="${avatar}" alt="Avatar" class="w-8 h-8 rounded-full mt-1">
                    <div class="flex-1 bg-white p-3 rounded-lg border">
                        <div class="flex justify-between items-center">
                            <p class="font-bold text-sm text-slate-800">${author.name || 'Usuario'}</p>
                            <p class="text-xs text-slate-400">${timestamp}</p>
                        </div>
                        <p class="text-sm text-slate-600 mt-1 whitespace-pre-wrap">${comment.text || ''}</p>
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
        const commentsRef = collection(db, COLLECTIONS.TAREAS, task.docId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));
        commentsUnsubscribe = onSnapshot(q, (snapshot) => {
            const comments = snapshot.docs.map(doc => doc.data());
            renderTaskComments(comments);
        }, (error) => {
            console.error('Error fetching comments: ', error);
            renderTaskComments([]);
        });
    } else {
        renderTaskComments([]);
        postCommentBtn.disabled = true;
        newCommentInput.disabled = true;
        newCommentInput.placeholder = 'Guarde la tarea para poder añadir comentarios.';
    }

    const postComment = async () => {
        if (!task) return;
        const text = newCommentInput.value.trim();
        if (!text) return;

        try {
            const commentsRef = collection(db, COLLECTIONS.TAREAS, task.docId, 'comments');
            await addDoc(commentsRef, {
                text,
                creatorUid: appState.currentUser.uid,
                createdAt: new Date()
            });
            newCommentInput.value = '';
        } catch (error) {
            console.error('Error posting comment:', error);
            showToast('Error al publicar el comentario.', 'error');
        }
    };

    postCommentBtn?.addEventListener('click', postComment);
    newCommentInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            postComment();
        }
    });

    return commentsUnsubscribe;
}

async function deleteTask(taskId) {
    await deleteDoc(doc(db, COLLECTIONS.TAREAS, taskId));
}

async function saveTask(taskId, data, isEditing) {
    if (isEditing) {
        const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
        await updateDoc(taskRef, data);
    } else {
        await addDoc(collection(db, COLLECTIONS.TAREAS), data);
    }
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
        effort: form.querySelector('[name="effort"]').value,
        startDate: form.querySelector('[name="startDate"]').value,
        dueDate: form.querySelector('[name="dueDate"]').value,
        plannedDate: form.querySelector('[name="plannedDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement?.dataset?.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

    const titleKeywords = data.title.toLowerCase().split(' ').filter(w => w.length > 2);
    let tags = [];
    if (isEditing) {
        try {
            const taskDoc = await getDoc(doc(db, COLLECTIONS.TAREAS, taskId));
            if (taskDoc.exists()) {
                tags = taskDoc.data().tags || [];
            }
        } catch (error) {
            console.error('Could not fetch existing task to preserve tags:', error);
        }
    }
    data.search_keywords = [...new Set([...titleKeywords, ...tags])];

    const isPublicCheckbox = form.querySelector('[name="isPublic"]');
    if (isPublicCheckbox) {
        data.isPublic = isPublicCheckbox.checked;
    } else if (!isEditing) {
        data.isPublic = false;
    }

    const saveButton = modalElement?.querySelector('button[type="submit"]');
    if (!saveButton) return;

    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
    lucide.createIcons();

    try {
        if (isEditing) {
            await saveTask(taskId, data, true);
            showToast('Tarea actualizada con éxito.', 'success');
        } else {
            const payload = {
                ...data,
                creatorUid: appState.currentUser.uid,
                createdAt: new Date(),
                status: form.querySelector('[name="status"]').value || 'todo'
            };
            await saveTask(null, payload, false);
            showToast('Tarea creada con éxito.', 'success');
        }
        modalElement?.remove();
        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Error al guardar la tarea.', 'error');
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonHTML;
        lucide.createIcons();
    }
}

function initModalEventListeners(modalElement, task, commentsUnsubscribe) {
    const form = modalElement.querySelector('form');
    form?.addEventListener('submit', handleTaskFormSubmit);

    modalElement.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'close') {
            commentsUnsubscribe?.();
            modalElement.remove();
        } else if (action === 'delete' && task) {
            showConfirmationModal('Eliminar Tarea', '¿Estás seguro de que quieres eliminar esta tarea?', async () => {
                try {
                    commentsUnsubscribe?.();
                    await deleteTask(task.docId);
                    showToast('Tarea eliminada.', 'success');
                    modalElement.remove();
                    document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
                } catch (error) {
                    console.error('Error deleting task:', error);
                    showToast('No tienes permiso para eliminar esta tarea.', 'error');
                }
            });
        }
    });
}

export async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;
    const isAdmin = appState.currentUser.role === 'admin';

    if (isEditing && (Array.isArray(task.dependsOn) && task.dependsOn.length > 0 || Array.isArray(task.blocks) && task.blocks.length > 0)) {
        const allTasks = await fetchAllTasks();
        const tasksById = new Map(allTasks.map(t => [t.docId, t]));

        if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
            task.dependsOnDetails = task.dependsOn
                .map(id => {
                    const dependentTask = tasksById.get(id);
                    return dependentTask ? { docId: id, title: dependentTask.title } : null;
                })
                .filter(Boolean);
        }

        if (Array.isArray(task.blocks) && task.blocks.length > 0) {
            task.blocksDetails = task.blocks
                .map(id => {
                    const blockingTask = tasksById.get(id);
                    return blockingTask ? { docId: id, title: blockingTask.title } : null;
                })
                .filter(Boolean);
        }
    }

    let selectedUid = defaultAssigneeUid || '';
    if (!selectedUid) {
        if (isEditing && task.assigneeUid) {
            selectedUid = task.assigneeUid;
        } else {
            selectedUid = appState.currentUser.uid;
        }
    }

    if (!isAdmin) {
        selectedUid = appState.currentUser.uid;
    }

    const modalHTML = getTaskFormModalHTML(task, defaultStatus, selectedUid, defaultDate, isAdmin);
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById('task-form-modal');
    populateTaskAssigneeDropdown();

    if (!isAdmin) {
        const assigneeSelect = modalElement.querySelector('#task-assignee');
        if (assigneeSelect) {
            assigneeSelect.disabled = true;
        }
    }

    initSubtasks(modalElement, task);
    const commentsUnsubscribe = initComments(modalElement, task);
    initModalEventListeners(modalElement, task, commentsUnsubscribe);
}

function buildExecutionSteps(plan) {
    return Array.isArray(plan) ? plan.map(step => ({
        description: step.description || 'Acción del plan',
        status: 'pending'
    })) : [];
}

export function openAIAssistantModal() {
    dom.modalContainer.innerHTML = getAIChatModalHTML();
    const modalElement = document.getElementById('ai-assistant-modal');
    const messagesContainer = document.getElementById('ai-chat-messages');
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send-btn');
    lucide.createIcons();

    let conversationId = null;
    let jobUnsubscribe = null;

    const closeModal = () => {
        jobUnsubscribe?.();
        modalElement?.remove();
    };

    const addMessage = (sender, content, type = 'text') => {
        const messageHTML = getAIChatMessageHTML(sender, content, type);
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        const messageElement = messagesContainer.lastElementChild;
        lucide.createIcons();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return messageElement;
    };

    if (messagesContainer) {
        addMessage('ai', 'Hola, ¿qué quieres hacer hoy? Puedo ayudarte a planificar o ejecutar tareas.');
    }

    const updateExecutionStepStatus = (planContainer, stepIndex, status, message) => {
        const stepElement = planContainer?.querySelector(`#execution-step-${stepIndex}`);
        if (!stepElement) return;
        const statusText = stepElement.querySelector('.status-text');
        const statusIcon = stepElement.querySelector('.status-icon');
        if (statusText) {
            const labels = { completed: 'Completado', error: 'Error', pending: 'Pendiente' };
            statusText.textContent = labels[status] || 'Pendiente';
        }
        if (statusIcon) {
            statusIcon.dataset.status = status;
            if (status === 'completed') {
                statusIcon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>';
            } else if (status === 'error') {
                statusIcon.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5 text-red-500"></i>';
            } else {
                statusIcon.innerHTML = '<i data-lucide="loader-circle" class="w-5 h-5 animate-spin text-slate-400"></i>';
            }
        }
        if (message) {
            const finalThought = planContainer?.querySelector('#execution-final-thought');
            if (finalThought) {
                finalThought.innerHTML = `<p class="text-sm text-slate-600 dark:text-slate-300">${message}</p>`;
            }
        }
        lucide.createIcons();
    };

    const handleJobUpdate = (docSnapshot) => {
        const jobData = docSnapshot.data();
        const loadingBubble = document.getElementById('ai-loading-bubble');
        if (!jobData) return;

        const isPlanReady = jobData.status === 'COMPLETED' || jobData.status === 'AWAITING_CONFIRMATION';

        if (isPlanReady) {
            jobUnsubscribe?.();
            loadingBubble?.remove();

            const hasExecutionPlan = Array.isArray(jobData.executionPlan) && jobData.executionPlan.length > 0;

            if (hasExecutionPlan) {
                const taskTitleMap = new Map();
                (jobData.tasks || []).forEach(taskItem => {
                    if (taskItem?.docId) {
                        taskTitleMap.set(taskItem.docId, taskItem.title || 'Tarea sin título');
                    }
                });
                (jobData.executionPlan || []).forEach(actionItem => {
                    if (!actionItem?.docId) return;
                    if (actionItem.action === 'CREATE') {
                        const actionTitle = actionItem?.task?.title || 'Tarea sin título';
                        taskTitleMap.set(actionItem.docId, actionTitle);
                    } else if (actionItem.originalTitle && !taskTitleMap.has(actionItem.docId)) {
                        taskTitleMap.set(actionItem.docId, actionItem.originalTitle);
                    }
                });

                const planMessageElement = addMessage('ai', { plan: { ...jobData, jobId: docSnapshot.id }, taskTitleMap }, 'plan');
                const confirmButton = planMessageElement?.querySelector('#ai-confirm-plan-btn');
                const planContainer = planMessageElement?.querySelector('[data-plan-container="true"]');
                const planInput = planMessageElement?.querySelector('#ai-plan-json');

                const planPayload = {
                    jobId: docSnapshot.id,
                    executionPlan: jobData.executionPlan || [],
                    thoughtProcess: jobData.thoughtProcess || '',
                    sanitySuggestions: jobData.sanitySuggestions || [],
                    summary: jobData.summary || ''
                };

                if (confirmButton) {
                    confirmButton.disabled = jobData.awaitingUserConfirmation === false;
                    confirmButton.dataset.plan = JSON.stringify(planPayload);
                }

                if (planInput && confirmButton?.dataset.plan) {
                    planInput.value = confirmButton.dataset.plan;
                    planInput.dataset.jobId = docSnapshot.id;
                }

                if (planContainer) {
                    planContainer.dataset.jobId = docSnapshot.id;
                }

                if (jobData.summary) {
                    addMessage('ai', jobData.summary, 'text');
                }
            } else if (jobData.summary) {
                addMessage('ai', jobData.summary, 'text');
            } else {
                addMessage('ai', 'He terminado, pero no tengo un resumen que mostrar.', 'text');
            }
            sendBtn.disabled = false;
        } else if (jobData.status === 'ERROR') {
            jobUnsubscribe?.();
            loadingBubble?.remove();
            addMessage('ai', `Lo siento, encontré un error: ${jobData.error}`, 'text');
            sendBtn.disabled = false;
        }
    };

    const startJob = async (prompt) => {
        sendBtn.disabled = true;
        addMessage('user', prompt, 'text');
        messagesContainer.insertAdjacentHTML('beforeend', getAILoadingMessageHTML());
        lucide.createIcons();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const startJobFn = httpsCallable(functions, 'startAIAgentJob');
            const allTasks = await fetchAllTasks();
            const result = await startJobFn({ userPrompt: prompt, tasks: allTasks, conversationId });

            const newJobId = result.data.jobId;
            conversationId = result.data.conversationId;

            jobUnsubscribe?.();
            const jobRef = doc(db, 'ai_agent_jobs', newJobId);
            jobUnsubscribe = onSnapshot(jobRef, handleJobUpdate);
        } catch (error) {
            console.error('Error starting AI job:', error);
            const loadingBubble = document.getElementById('ai-loading-bubble');
            loadingBubble?.remove();
            addMessage('ai', `Hubo un error al iniciar el proceso: ${error.message}`, 'text');
            sendBtn.disabled = false;
        }
    };

    chatForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const userPrompt = chatInput.value.trim();
        if (userPrompt) {
            startJob(userPrompt);
            chatInput.value = '';
            chatInput.style.height = 'auto';
        }
    });

    chatInput?.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    modalElement?.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'close') {
            closeModal();
        } else if (action === 'reject-ai-plan') {
            e.preventDefault();
            const planContainer = button.closest('[data-plan-container="true"]');
            planContainer?.remove();
            sendBtn.disabled = false;
            chatInput.focus();
            addMessage('ai', 'De acuerdo, cuéntame cómo quieres ajustar el plan o pide una nueva propuesta.');
        } else if (action === 'confirm-ai-plan') {
            e.preventDefault();
            const form = document.getElementById('ai-execution-plan-form');
            if (!form) {
                showToast('No se encontró el formulario del plan.', 'error');
                return;
            }

            let planData;
            try {
                planData = JSON.parse(button.dataset.plan || form.querySelector('#ai-plan-json')?.value || '{}');
            } catch (error) {
                console.error('Error parsing plan data:', error);
                showToast('No se pudo leer el plan de ejecución.', 'error');
                return;
            }

            if (!planData?.jobId) {
                showToast('Falta el identificador del trabajo para ejecutar el plan.', 'error');
                return;
            }

            const rejectButton = form.closest('[data-plan-container="true"]')?.querySelector('#ai-reject-plan-btn');
            if (rejectButton) {
                rejectButton.disabled = true;
            }

            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5 mr-2"></i>Ejecutando...';
            lucide.createIcons();

            const executionPlanActions = Array.isArray(planData.executionPlan) ? planData.executionPlan : [];
            const updatedExecutionPlan = [];

            const buildSubtasksFromInput = (inputValue, existingSubtasks = []) => {
                if (!inputValue) {
                    return existingSubtasks;
                }
                const titles = inputValue.split('\n').map(title => title.trim()).filter(Boolean);
                return titles.map(title => ({
                    id: `sub_${Date.now()}_${Math.random()}`,
                    title,
                    completed: false
                }));
            };

            executionPlanActions.forEach((action, index) => {
                const actionId = `action_${index}`;
                const enabledInput = form.querySelector(`input[name="${actionId}_enabled"]`);
                if (enabledInput && !enabledInput.checked) {
                    return;
                }

                const clonedAction = JSON.parse(JSON.stringify(action));

                if (clonedAction.action === 'CREATE') {
                    const titleInput = form.querySelector(`#${actionId}_title`);
                    const dueDateInput = form.querySelector(`#${actionId}_dueDate`);
                    const plannedDateInput = form.querySelector(`#${actionId}_plannedDate`);
                    const subtasksInput = form.querySelector(`#${actionId}_subtasks`);
                    if (titleInput) {
                        clonedAction.task = clonedAction.task || {};
                        clonedAction.task.title = titleInput.value.trim();
                    }
                    if (dueDateInput) {
                        clonedAction.task = clonedAction.task || {};
                        clonedAction.task.dueDate = dueDateInput.value || null;
                    }
                    if (plannedDateInput) {
                        clonedAction.task = clonedAction.task || {};
                        clonedAction.task.plannedDate = plannedDateInput.value || null;
                    }
                    if (subtasksInput) {
                        clonedAction.task = clonedAction.task || {};
                        const existingSubtasks = Array.isArray(clonedAction.task.subtasks) ? clonedAction.task.subtasks : [];
                        clonedAction.task.subtasks = buildSubtasksFromInput(subtasksInput.value, existingSubtasks);
                    }
                }

                if (clonedAction.action === 'UPDATE') {
                    const docIdInput = form.querySelector(`input[name="${actionId}_docId"]`);
                    if (docIdInput) {
                        clonedAction.docId = docIdInput.value;
                    }

                    const updateFields = Array.from(form.querySelectorAll(`input[name^="${actionId}_update_field_"]`));
                    const updates = {};
                    updateFields.forEach(fieldInput => {
                        const match = fieldInput.name.match(/_(\d+)$/);
                        if (!match) return;
                        const updateIndex = match[1];
                        const fieldName = fieldInput.value;
                        const valueInput = form.querySelector(`[name="${actionId}_update_value_${updateIndex}"]`);
                        if (!valueInput) return;

                        let value = valueInput.value;
                        if (fieldName === 'dependsOn' || fieldName === 'blocks') {
                            try {
                                value = JSON.parse(value);
                            } catch (error) {
                                console.warn('No se pudo parsear la dependencia del plan:', error);
                                value = [];
                            }
                        } else if (fieldName === 'blocked') {
                            value = value === 'true' || value === true;
                        } else if (fieldName === 'dueDate' || fieldName === 'plannedDate') {
                            value = value || null;
                        } else if (fieldName === 'subtasks') {
                            const existingSubtasks = Array.isArray(clonedAction.updates?.subtasks) ? clonedAction.updates.subtasks : [];
                            value = buildSubtasksFromInput(value, existingSubtasks);
                        }
                        updates[fieldName] = value;
                    });

                    clonedAction.updates = updates;
                }

                updatedExecutionPlan.push({
                    ...clonedAction,
                    description: clonedAction.description || 'Acción del plan'
                });
            });

            if (updatedExecutionPlan.length === 0) {
                showToast('Debes seleccionar al menos una acción para ejecutar.', 'warning');
                button.disabled = false;
                button.innerHTML = '<i data-lucide="check-check" class="w-5 h-5"></i>Confirmar y Ejecutar';
                if (rejectButton) {
                    rejectButton.disabled = false;
                }
                lucide.createIcons();
                return;
            }

            const executePlanFn = httpsCallable(functions, 'executeTaskModificationPlan');

            try {
                await executePlanFn({ plan: updatedExecutionPlan, jobId: planData.jobId });

                const modalContent = document.getElementById('ai-assistant-modal-content');
                if (modalContent) {
                    const progressSteps = buildExecutionSteps(updatedExecutionPlan);
                    modalContent.innerHTML = getAIAssistantExecutionProgressViewHTML(progressSteps);
                    lucide.createIcons();
                }

                const executionUnsubscribe = onSnapshot(doc(db, 'plan_executions', planData.jobId), (snapshot) => {
                    const executionData = snapshot.data();
                    if (!executionData) return;

                    const planContainer = document.getElementById('ai-assistant-modal-content');
                    if (!planContainer) return;

                    (executionData.steps || []).forEach((step, index) => {
                        updateExecutionStepStatus(planContainer, index, step.status, step.message);
                    });

                    if (executionData.status === 'COMPLETED' || executionData.status === 'ERROR') {
                        const closeBtn = planContainer.querySelector('#execution-complete-close-btn');
                        if (closeBtn) {
                            closeBtn.disabled = false;
                            closeBtn.innerHTML = executionData.status === 'COMPLETED'
                                ? '<i data-lucide="check-circle" class="w-5 h-5"></i><span>Finalizado</span>'
                                : '<i data-lucide="alert-circle" class="w-5 h-5"></i><span>Finalizado con errores</span>';
                        }
                        lucide.createIcons();
                        executionUnsubscribe();
                        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
                    }
                });
            } catch (error) {
                console.error('Error executing plan:', error);
                showToast('Error al ejecutar el plan.', 'error');
                button.disabled = false;
                button.innerHTML = '<i data-lucide="check-check" class="w-5 h-5"></i>Confirmar y Ejecutar';
                if (rejectButton) {
                    rejectButton.disabled = false;
                }
                lucide.createIcons();
            }
        }
    });
}

export async function completeAndArchiveTask(taskId) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    await updateDoc(taskRef, {
        status: 'done',
        isArchived: true,
        completedAt: new Date()
    });
}

export function updateTaskBlockedStatus(taskId, isBlocked) {
    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
    return updateDoc(taskRef, { blocked: isBlocked });
}

export async function fetchAllTasks() {
    const tasksQuery = query(collection(db, COLLECTIONS.TAREAS));
    const snapshot = await getDocs(tasksQuery);
    return snapshot.docs.map(docSnap => ({ ...docSnap.data(), docId: docSnap.id }));
}

export function showPlannerHelpModal() {
    dom.modalContainer.innerHTML = getPlannerHelpModalHTML();
    lucide.createIcons();

    const modalElement = document.getElementById('planner-help-modal');

    const closeModal = () => {
        modalElement?.remove();
    };

    modalElement?.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            closeModal();
        }
    });

    return modalElement;
}

function buildTaskSummaryCard(task) {
    const usersMap = getUsersMap();
    const assignee = task.assigneeUid ? usersMap.get(task.assigneeUid) : null;
    const priorityColors = { high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-green-500' };
    const priorityClass = priorityColors[task.priority || 'medium'];

    const dueDate = task.dueDate ? new Date(`${task.dueDate}T00:00:00`) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = dueDate ? dueDate < today : false;
    const dueDateLabel = dueDate ? dueDate.toLocaleDateString('es-AR') : 'Sin fecha';

    return `
        <article class="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer task-summary-card" data-task-id="${task.docId}">
            <header class="flex items-start justify-between gap-2">
                <h4 class="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">${task.title}</h4>
                <span class="w-3 h-3 rounded-full ${priorityClass}" title="Prioridad: ${task.priority || 'medium'}"></span>
            </header>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-3">${task.description || 'Sin descripción.'}</p>
            <footer class="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span class="flex items-center gap-1">
                    <i data-lucide="calendar" class="w-4 h-4"></i>
                    <span class="${isOverdue ? 'text-red-500 font-semibold' : ''}">${dueDateLabel}</span>
                </span>
                <span class="flex items-center gap-1">
                    <i data-lucide="user" class="w-4 h-4"></i>
                    <span>${assignee?.name?.split(' ')[0] || 'Sin asignar'}</span>
                </span>
            </footer>
        </article>
    `;
}

export function showTasksInModal(title, tasks) {
    dom.modalContainer.innerHTML = getTasksModalHTML(title);
    const modalElement = document.getElementById('tasks-list-modal');
    const tasksContainer = modalElement?.querySelector('#modal-tasks-container');

    if (!tasksContainer) return;

    if (!tasks || tasks.length === 0) {
        tasksContainer.innerHTML = '<p class="text-center text-slate-500 py-8">No hay tareas para mostrar en esta sección.</p>';
    } else {
        tasksContainer.innerHTML = tasks.map(buildTaskSummaryCard).join('');
        lucide.createIcons();

        tasksContainer.querySelectorAll('.task-summary-card').forEach(card => {
            card.addEventListener('click', async () => {
                const taskId = card.dataset.taskId;
                const task = tasks.find(t => t.docId === taskId);
                if (task) {
                    await openTaskFormModal(task);
                }
            });
        });
    }

    modalElement?.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) {
            modalElement.remove();
        }
    });
}


/**
 * Task modal UI helpers.
 *
 * Responsible for rendering the task creation/edit modal, orchestrating
 * Firestore-backed submissions, and coordinating AI assistant interactions.
 * The module consumes shared dependencies injected during initialization so it
 * can remain framework-agnostic and testable.
 *
 * @module modules/tasks/task.modal
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { collection, onSnapshot, query, orderBy, addDoc, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { checkUserPermission, getEffectiveRole, showConfirmationModal, showToast } from '../../main.js';
import { handleTaskFormSubmit, deleteTask, createTask, fetchAllTasks } from './task.service.js';
import {
    getTaskFormModalHTML,
    getSubtaskHTML,
    getMultiTaskConfirmationHTML,
    getAIChatModalHTML,
    getAIChatMessageHTML,
    getAILoadingMessageHTML,
    getAIAssistantReviewViewHTML,
    getAIAssistantExecutionProgressViewHTML
} from './task.templates.js';

let appState;
let dom;
let lucide;
let db;
let functions;

/**
 * Wires runtime dependencies used by the modal helpers.
 *
 * @param {Object} dependencies - Shared application services and state.
 */
export function initTaskModal(dependencies) {
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    db = dependencies.db;
    functions = dependencies.functions;
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

/**
 * Opens the task modal populated with an existing record or default values.
 *
 * @param {Object|null} task - Task record to edit, or null to create a new one.
 * @param {string} [defaultStatus='todo'] - Status pre-selected for new tasks.
 * @param {string|null} [defaultAssigneeUid=null] - User ID to prefill as assignee.
 * @param {string|null} [defaultDate=null] - ISO date string to seed date fields.
 */
export async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;
    const isAdmin = getEffectiveRole() === 'admin';

    // Enrich task object with dependency details for the modal view
    if (isEditing && (task.dependsOn?.length > 0 || task.blocks?.length > 0)) {
        const allTasks = await fetchAllTasks(true); // Force refresh to get latest dependency info
        const tasksById = new Map(allTasks.map(t => [t.docId, t]));

        if (task.dependsOn?.length > 0) {
            task.dependsOnDetails = task.dependsOn
                .map(id => {
                    const dependentTask = tasksById.get(id);
                    return dependentTask ? { docId: id, title: dependentTask.title } : null;
                })
                .filter(Boolean); // Remove nulls if a referenced task was deleted
        }

        if (task.blocks?.length > 0) {
            task.blocksDetails = task.blocks
                .map(id => {
                    const blockingTask = tasksById.get(id);
                    return blockingTask ? { docId: id, title: blockingTask.title } : null;
                })
                .filter(Boolean); // Remove nulls if a referenced task was deleted
        }
    }

    let selectedUid = defaultAssigneeUid || '';
    if (!selectedUid && isEditing && task.assigneeUid) {
        selectedUid = task.assigneeUid;
    }

    if (!selectedUid && !isEditing) {
        selectedUid = appState.currentUser.uid;
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
}

/**
 * Displays the AI assistant modal and initializes the conversation shell.
 */
export function openAIAssistantModal() {
    dom.modalContainer.innerHTML = getAIChatModalHTML();
    const modalElement = document.getElementById('ai-assistant-modal');
    const messagesContainer = document.getElementById('ai-chat-messages');
    const chatForm = document.getElementById('ai-chat-form');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send-btn');

    let conversationId = null;
    let jobUnsubscribe = null;

    const closeModal = () => {
        if (jobUnsubscribe) jobUnsubscribe();
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

    const handleJobUpdate = (doc) => {
        const jobData = doc.data();
        const loadingBubble = document.getElementById('ai-loading-bubble');
        if (!jobData) return;

        const isPlanReady = jobData.status === 'COMPLETED' || jobData.status === 'AWAITING_CONFIRMATION';

        if (isPlanReady) {
            if (jobUnsubscribe) jobUnsubscribe();
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

                const planMessageElement = addMessage('ai', { plan: { ...jobData, jobId: doc.id }, taskTitleMap }, 'plan');
                const confirmButton = planMessageElement?.querySelector('#ai-confirm-plan-btn');
                const planContainer = planMessageElement?.querySelector('[data-plan-container="true"]');
                const planInput = planMessageElement?.querySelector('#ai-plan-json');

                const planPayload = {
                    jobId: doc.id,
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
                    planInput.dataset.jobId = doc.id;
                }

                if (planContainer) {
                    planContainer.dataset.jobId = doc.id;
                }

                if (jobData.summary) {
                    addMessage('ai', jobData.summary, 'text');
                }
            } else if (jobData.summary) {
                addMessage('ai', jobData.summary, 'text');
            } else {
                addMessage('ai', "He terminado, pero no tengo un resumen que mostrar.", 'text');
            }
            sendBtn.disabled = false;
        } else if (jobData.status === 'ERROR') {
            if (jobUnsubscribe) jobUnsubscribe();
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
            conversationId = result.data.conversationId; // Update conversationId from backend

            if (jobUnsubscribe) jobUnsubscribe();
            const jobRef = doc(db, 'ai_agent_jobs', newJobId);
            jobUnsubscribe = onSnapshot(jobRef, handleJobUpdate);

        } catch (error) {
            console.error("Error starting AI job:", error);
            const loadingBubble = document.getElementById('ai-loading-bubble');
            loadingBubble?.remove();
            addMessage('ai', `Hubo un error al iniciar el proceso: ${error.message}`, 'text');
            sendBtn.disabled = false;
        }
    };

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userPrompt = chatInput.value.trim();
        if (userPrompt) {
            startJob(userPrompt);
            chatInput.value = '';
            chatInput.style.height = 'auto';
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    // A single, delegated event listener for all actions within the modal.
    modalElement.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'close') {
            closeModal();
        } else if (action === 'reject-ai-plan') {
            e.preventDefault();
            const planContainer = button.closest('[data-plan-container="true"]');
            if (planContainer) {
                planContainer.remove();
            }
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

            const updatedExecutionPlan = [];
            const executionPlanActions = Array.isArray(planData.executionPlan) ? planData.executionPlan : [];

            const buildSubtasksFromInput = (inputValue, existingSubtasks = []) => {
                if (!inputValue) {
                    return [];
                }

                const titles = inputValue
                    .split('\n')
                    .map(title => title.trim())
                    .filter(Boolean);

                if (titles.length === 0) {
                    return [];
                }

                return titles.map((title, index) => {
                    const baseSubtask = existingSubtasks[index] || {};
                    return {
                        ...baseSubtask,
                        title,
                        completed: typeof baseSubtask.completed === 'boolean' ? baseSubtask.completed : false
                    };
                });
            };
            const buildDescriptionFromAction = (action) => {
                if (!action) return 'Acción del plan';
                switch (action.action) {
                    case 'CREATE':
                        return `Crear tarea "${action.task?.title || 'Sin título'}"`;
                    case 'UPDATE':
                        return `Actualizar tarea "${action.originalTitle || action.docId || 'Sin título'}"`;
                    case 'DELETE':
                        return `Eliminar tarea "${action.originalTitle || action.docId || 'Sin título'}"`;
                    default:
                        return action.description || 'Acción del plan';
                }
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
                    description: buildDescriptionFromAction(clonedAction)
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
                    const progressSteps = updatedExecutionPlan.map(step => ({
                        description: step.description,
                        status: 'pending'
                    }));
                    modalContent.innerHTML = getAIAssistantExecutionProgressViewHTML(progressSteps);
                    lucide.createIcons();
                }

                const executionUnsubscribe = onSnapshot(doc(db, "plan_executions", planData.jobId), (snapshot) => {
                    const executionData = snapshot.data();
                    if (!executionData) return;

                    const steps = executionData.steps || [];
                    steps.forEach((step, index) => {
                        const stepEl = document.getElementById(`execution-step-${index}`);
                        if (!stepEl) return;
                        const statusIcon = stepEl.querySelector('.status-icon');
                        const statusText = stepEl.querySelector('.status-text');

                        if (step.status === 'completed') {
                            statusIcon.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500"></i>';
                            if (statusText) {
                                statusText.textContent = 'Completado';
                            }
                            stepEl.classList.add('opacity-70');
                        } else if (step.status === 'error') {
                            statusIcon.innerHTML = '<i data-lucide="x-circle" class="w-5 h-5 text-red-500"></i>';
                            if (statusText) {
                                statusText.textContent = `Error: ${step.error || 'Desconocido'}`;
                            }
                            stepEl.classList.add('bg-red-50');
                        }
                    });

                    if (executionData.status === 'completed' || executionData.status === 'error') {
                        if (executionUnsubscribe) executionUnsubscribe();

                        const isError = executionData.status === 'error';
                        const headerCloseBtn = document.getElementById('execution-close-btn');
                        const footerCloseBtn = document.getElementById('execution-complete-close-btn');

                        if (headerCloseBtn) {
                            headerCloseBtn.classList.remove('hidden');
                        }

                        if (footerCloseBtn) {
                            footerCloseBtn.disabled = false;
                            footerCloseBtn.classList.remove('bg-purple-600', 'hover:bg-purple-700', 'bg-green-600', 'hover:bg-green-700', 'bg-red-600', 'hover:bg-red-700');
                            footerCloseBtn.classList.add(
                                isError ? 'bg-red-600' : 'bg-green-600',
                                isError ? 'hover:bg-red-700' : 'hover:bg-green-700'
                            );
                            footerCloseBtn.innerHTML = `
                                <i data-lucide="${isError ? 'x-circle' : 'check-circle-2'}" class="w-5 h-5"></i>
                                <span>${isError ? 'Cerrar con errores' : 'Cerrar'}</span>
                            `;
                        }

                        const finalThought = document.getElementById('execution-final-thought');
                        if (finalThought) {
                            const summaryText = executionData.summary || (isError ? 'Ocurrió un problema durante la ejecución.' : 'El plan ha finalizado.');
                            finalThought.innerHTML = `
                                <div class="flex items-start gap-3 mt-4 p-4 rounded-lg ${isError ? 'bg-red-50 dark:bg-red-900/30' : 'bg-slate-100 dark:bg-slate-700'}">
                                    <i data-lucide="${isError ? 'x-octagon' : 'check-circle-2'}" class="w-5 h-5 mt-1 ${isError ? 'text-red-600 dark:text-red-300' : 'text-green-600 dark:text-green-300'}"></i>
                                    <div>
                                        <p class="text-sm font-semibold ${isError ? 'text-red-700 dark:text-red-200' : 'text-slate-700 dark:text-slate-300'}">${isError ? 'Ejecución con errores' : 'Ejecución completada'}</p>
                                        <p class="text-sm mt-1 ${isError ? 'text-red-600 dark:text-red-200' : 'text-slate-600 dark:text-slate-400'}">${summaryText}</p>
                                    </div>
                                </div>
                            `;
                        }

                        lucide.createIcons();
                        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
                    }
                });

            } catch (error) {
                console.error("Error executing plan:", error);
                showToast(`Error al ejecutar el plan: ${error.message}`, 'error');
                button.disabled = false;
                button.innerHTML = '<i data-lucide="check-check" class="w-5 h-5"></i>Confirmar y Ejecutar';
                if (rejectButton) {
                    rejectButton.disabled = false;
                }
                lucide.createIcons();
            }
        }
    });

    // Initial greeting from AI
    addMessage('ai', 'Hola, soy tu asistente de IA. ¿Cómo puedo ayudarte a organizar tus tareas hoy?');
}
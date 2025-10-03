/**
 * @file Manages the task creation and editing modal.
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { collection, onSnapshot, query, orderBy, addDoc, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { checkUserPermission, showConfirmationModal, showToast } from '../../main.js';
import { getState } from './task.state.js';
import { handleTaskFormSubmit, deleteTask, createTask, fetchAllTasks } from './task.service.js';
import {
    getTaskFormModalHTML,
    getSubtaskHTML,
    getMultiTaskConfirmationHTML,
    getAIAssistantModalHTML,
    getAIAssistantPromptViewHTML,
    getAIAssistantLoadingViewHTML,
    getAIAssistantReviewViewHTML,
    getAIAssistantExecutionProgressViewHTML
} from './task.templates.js';

let appState;
let dom;
let lucide;
let db;
let functions;

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

export async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;
    const isAdmin = appState.currentUser.role === 'admin';

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
}

export async function openAIAssistantModal() {
    // Render the modal shell
    dom.modalContainer.innerHTML = getAIAssistantModalHTML();
    const modalElement = document.getElementById('ai-assistant-modal');
    const viewContainer = document.getElementById('ai-assistant-view-container');
    let currentPlan = null; // To store the plan between views

    const closeModal = () => {
        // Dispatch a custom event to clean up any listeners
        modalElement.dispatchEvent(new CustomEvent('close-modal'));
        modalElement?.remove();
    };

    // --- Step 4: Execution Progress View ---
    const renderExecutionProgressView = (jobId, plan) => {
        let unsubscribe;
        const steps = plan.map((action, index) => {
            let description = `Acción: ${action.action}`;
            if (action.originalTitle) {
                description = `Ejecutar en: "${action.originalTitle}"`;
            } else if (action.task && action.task.title) {
                description = `Crear: "${action.task.title}"`;
            }
            return { id: index, description, status: 'PENDING' };
        });

        viewContainer.innerHTML = getAIAssistantExecutionProgressViewHTML(steps);
        lucide.createIcons();

        const executionStepsList = viewContainer.querySelector('#execution-steps-list');
        const closeBtn = viewContainer.querySelector('#execution-close-btn');
        const completeBtn = viewContainer.querySelector('#execution-complete-close-btn');

        closeBtn.addEventListener('click', closeModal);

        const executionRef = doc(db, 'plan_executions', jobId);
        unsubscribe = onSnapshot(executionRef, (doc) => {
            const executionData = doc.data();
            if (!executionData || !executionData.steps) return;

            // BUG FIX: Firestore can return array-like objects as actual objects.
            // Convert to an array before iterating to prevent "forEach is not a function" error.
            const stepsArray = Array.isArray(executionData.steps) ? executionData.steps : Object.values(executionData.steps);

            stepsArray.forEach((step, index) => {
                const stepElement = executionStepsList.querySelector(`#execution-step-${index}`);
                if (!stepElement) return;

                const iconContainer = stepElement.querySelector('.status-icon');
                const currentStatus = iconContainer.dataset.status;

                if (step.status !== currentStatus) {
                    iconContainer.dataset.status = step.status;
                    let iconHTML = '';
                    switch (step.status) {
                        case 'COMPLETED':
                            iconHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500"></i>';
                            stepElement.classList.remove('bg-slate-100', 'dark:bg-slate-700/50');
                            stepElement.classList.add('bg-green-50', 'dark:bg-green-900/20');
                            break;
                        case 'ERROR':
                            iconHTML = `<i data-lucide="x-circle" class="w-5 h-5 text-red-500" title="${step.error || 'Error'}"></i>`;
                            stepElement.classList.remove('bg-slate-100', 'dark:bg-slate-700/50');
                            stepElement.classList.add('bg-red-50', 'dark:bg-red-900/20');
                            break;
                        default: // PENDING
                            iconHTML = '<i data-lucide="loader-circle" class="w-5 h-5 animate-spin text-slate-400"></i>';
                    }
                    iconContainer.innerHTML = iconHTML;
                    lucide.createIcons();
                }
            });

            if (executionData.status === 'COMPLETED' || executionData.status === 'ERROR') {
                if (unsubscribe) unsubscribe();

                completeBtn.disabled = false;

                if (executionData.status === 'COMPLETED') {
                    completeBtn.className = 'bg-green-600 text-white px-5 py-2 rounded-md hover:bg-green-700 font-semibold transition-colors flex items-center gap-2';
                    completeBtn.innerHTML = `
                        <i data-lucide="party-popper" class="w-5 h-5"></i>
                        <span>¡Hecho! Cerrar</span>
                    `;
                    document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
                } else { // ERROR
                    completeBtn.className = 'bg-red-600 text-white px-5 py-2 rounded-md hover:bg-red-700 font-semibold transition-colors flex items-center gap-2';
                    completeBtn.innerHTML = `
                        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                        <span>Error. Cerrar</span>
                    `;
                }

                lucide.createIcons({ nodes: [completeBtn.querySelector('i')] });
                completeBtn.addEventListener('click', closeModal);
                closeBtn.classList.remove('hidden');
            }
        });

        modalElement.addEventListener('close-modal', () => {
            if (unsubscribe) unsubscribe();
        }, { once: true });
    };


    // --- Step 3: Review and Execute ---
    const renderReviewView = (plan, taskTitleMap) => {
        currentPlan = plan;

        viewContainer.innerHTML = getAIAssistantReviewViewHTML(plan, taskTitleMap);
        lucide.createIcons();

        const accordionBtn = viewContainer.querySelector('#thought-process-accordion-btn');
        accordionBtn.addEventListener('click', function() {
            const content = viewContainer.querySelector('#thought-process-content');
            const icon = this.querySelector('svg');
            const isHidden = content.style.display === 'none' || content.style.display === '';
            content.style.display = isHidden ? 'block' : 'none';
            if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        viewContainer.querySelector('[data-action="close"]').addEventListener('click', closeModal);
        viewContainer.querySelector('#ai-reject-plan-btn').addEventListener('click', () => renderPromptView(plan.userPrompt));

        const form = viewContainer.querySelector('#ai-execution-plan-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const modifiedExecutionPlan = [];
            const originalPlanLength = currentPlan.executionPlan.length;

            for (let i = 0; i < originalPlanLength; i++) {
                const actionId = `action_${i}`;
                if (!formData.get(`${actionId}_enabled`)) continue;

                const actionType = formData.get(`${actionId}_type`);
                const originalAction = currentPlan.executionPlan[i];
                const newAction = { action: actionType, originalTitle: originalAction.originalTitle };

                if (actionType === 'CREATE') {
                    newAction.task = { title: formData.get(`${actionId}_title`), dueDate: formData.get(`${actionId}_dueDate`) || null };
                    newAction.docId = originalAction.docId; // Keep temp ID for mapping
                } else if (actionType === 'UPDATE') {
                    newAction.docId = formData.get(`${actionId}_docId`);
                    newAction.updates = {};
                    let updateIndex = 0;
                    while (true) {
                        const updateField = formData.get(`${actionId}_update_field_${updateIndex}`);
                        if (!updateField) break; // No more update fields for this action

                        let updateValue = formData.get(`${actionId}_update_value_${updateIndex}`);
                        if (updateValue !== null) {
                            try {
                                // Attempt to parse if it's a JSON string (for arrays like dependsOn)
                                newAction.updates[updateField] = JSON.parse(updateValue);
                            } catch (e) {
                                // Otherwise, use the raw value
                                newAction.updates[updateField] = updateValue;
                            }
                        }
                        updateIndex++;
                    }
                } else if (actionType === 'DELETE') {
                    newAction.docId = originalAction.docId;
                }
                modifiedExecutionPlan.push(newAction);
            }

            if (modifiedExecutionPlan.length === 0) {
                showToast('No hay acciones seleccionadas para ejecutar.', 'warning');
                return;
            }

            const jobId = currentPlan.jobId;
            renderExecutionProgressView(jobId, modifiedExecutionPlan);

            try {
                const executePlanFn = httpsCallable(functions, 'executeTaskModificationPlan');
                await executePlanFn({ plan: modifiedExecutionPlan, jobId });
            } catch (error) {
                console.error("Error triggering plan execution:", error);
                showToast(error.message || 'Error al iniciar la ejecución del plan.', 'error');
            }
        });
    };

    // --- Step 2: Loading View ---
    const renderLoadingView = (userPrompt) => {
        viewContainer.innerHTML = getAIAssistantLoadingViewHTML('Generando plan con IA...');
        lucide.createIcons();
        const thinkingStepsContainer = viewContainer.querySelector('#thinking-steps-container');
        let unsubscribe;

        (async () => {
            try {
                const startJobFn = httpsCallable(functions, 'startAIAgentJob');
                const allTasks = await fetchAllTasks();
                const userTasks = allTasks.filter(task => task.assigneeUid === appState.currentUser.uid || task.creatorUid === appState.currentUser.uid || task.isPublic);

                const result = await startJobFn({ userPrompt, tasks: userTasks });
                const { jobId } = result.data;
                if (!jobId) throw new Error("La función no devolvió un ID de trabajo.");

                const jobRef = doc(db, 'ai_agent_jobs', jobId);
                unsubscribe = onSnapshot(jobRef, (doc) => {
                    const jobData = doc.data();
                    if (!jobData) return;

                    if (jobData.thinkingSteps && thinkingStepsContainer) {
                        thinkingStepsContainer.innerHTML = jobData.thinkingSteps.map(step => `
                            <p class="flex items-start gap-2 text-slate-600 dark:text-slate-300 animate-fade-in"><i data-lucide="check-circle" class="w-4 h-4 text-green-500 flex-shrink-0 mt-1"></i><span class="truncate" title="${step.thought}">${step.thought}</span></p>
                        `).join('');
                        lucide.createIcons();
                        thinkingStepsContainer.scrollTop = thinkingStepsContainer.scrollHeight;
                    }

                    if (jobData.status === 'COMPLETED') {
                        if (unsubscribe) unsubscribe();
                        const finalPlan = { ...jobData, jobId: doc.id };
                        const taskTitleMap = new Map(allTasks.map(t => [t.docId, t.title]));
                        finalPlan.executionPlan.forEach(action => {
                            if (action.action === 'CREATE') taskTitleMap.set(action.docId, action.task.title);
                        });
                        finalPlan.executionPlan.forEach(action => {
                            if (action.action !== 'CREATE') action.originalTitle = taskTitleMap.get(action.docId) || 'Tarea no encontrada';
                        });
                        renderReviewView(finalPlan, taskTitleMap);
                    } else if (jobData.status === 'ERROR') {
                        if (unsubscribe) unsubscribe();
                        throw new Error(jobData.error || "El agente de IA encontró un error desconocido.");
                    }
                });

                modalElement.addEventListener('close-modal', () => {
                    if (unsubscribe) unsubscribe();
                }, { once: true });

            } catch (error) {
                console.error("Error starting or monitoring AI agent job:", error);
                showToast(error.message || 'Ocurrió un error al contactar al Asistente IA.', 'error');
                if (unsubscribe) unsubscribe();
                renderPromptView(userPrompt);
            }
        })();
    };

    // --- Step 1: Prompt View ---
    const renderPromptView = (promptText = '') => {
        viewContainer.innerHTML = getAIAssistantPromptViewHTML();
        lucide.createIcons();

        const promptTextarea = viewContainer.querySelector('#ai-assistant-prompt-input');
        promptTextarea.value = promptText;
        promptTextarea.focus();

        viewContainer.querySelector('[data-action="close"]').addEventListener('click', closeModal);

        const generateBtn = viewContainer.querySelector('#ai-generate-plan-btn');
        generateBtn.addEventListener('click', () => {
            const userPrompt = promptTextarea.value.trim();
            if (!userPrompt) {
                showToast('Por favor, describe tu petición al asistente.', 'warning');
                return;
            }
            renderLoadingView(userPrompt);
        });

        viewContainer.addEventListener('click', (e) => {
            const templateButton = e.target.closest('[data-action="ai-template"]');
            if (templateButton) {
                const templateId = templateButton.dataset.templateId;
                if (templateId === 'new-amfe-process') {
                    promptTextarea.value = 'Iniciar un nuevo proceso de AMFE para...';
                    promptTextarea.focus();
                    promptTextarea.setSelectionRange(promptTextarea.value.length, promptTextarea.value.length);
                }
            }
        });
    };

    // Initial render
    renderPromptView();
}
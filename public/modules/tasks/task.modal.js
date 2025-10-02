/**
 * @file Manages the task creation and editing modal.
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { collection, onSnapshot, query, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
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
    getAIAssistantReviewViewHTML
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

    const closeModal = () => modalElement?.remove();

    // --- Step 3: Review and Execute ---
    const renderReviewView = (plan) => {
        currentPlan = plan; // Store the full plan for submission

        viewContainer.innerHTML = getAIAssistantReviewViewHTML(plan);
        lucide.createIcons();

        // Set up accordion for thought process
        const accordionBtn = viewContainer.querySelector('#thought-process-accordion-btn');
        if (accordionBtn) {
            accordionBtn.addEventListener('click', function() {
                const content = viewContainer.querySelector('#thought-process-content');
                // The icon is initially an <i>, but lucide replaces it with an <svg>.
                // We query for the svg to ensure we're manipulating the correct element post-rendering.
                const icon = this.querySelector('svg');
                const isHidden = content.style.display === 'none' || content.style.display === '';

                content.style.display = isHidden ? 'block' : 'none';
                if (icon) {
                    icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            });
        }

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
                if (!formData.get(`${actionId}_enabled`)) {
                    continue; // Skip disabled actions
                }

                const actionType = formData.get(`${actionId}_type`);
                const originalAction = currentPlan.executionPlan[i];
                const newAction = {
                    action: actionType,
                    originalTitle: originalAction.originalTitle
                };

                if (actionType === 'CREATE') {
                    newAction.task = {
                        title: formData.get(`${actionId}_title`),
                        dueDate: formData.get(`${actionId}_dueDate`) || null
                    };
                } else if (actionType === 'UPDATE') {
                    newAction.docId = formData.get(`${actionId}_docId`);
                    newAction.updates = {};
                    const updateField = formData.get(`${actionId}_update_field_0`);
                    const updateValue = formData.get(`${actionId}_update_value_0`);
                    newAction.updates[updateField] = updateValue;
                }

                modifiedExecutionPlan.push(newAction);
            }

            if (modifiedExecutionPlan.length === 0) {
                showToast('No hay acciones seleccionadas para ejecutar.', 'warning');
                return;
            }

            viewContainer.innerHTML = getAIAssistantLoadingViewHTML('Ejecutando el plan...');
            lucide.createIcons();

            try {
                const functions = getFunctions();
                const executePlanFn = httpsCallable(functions, 'executeTaskModificationPlan');
                const result = await executePlanFn({ plan: modifiedExecutionPlan });

                showToast(result.data.message || 'Plan ejecutado con éxito!', 'success');
                closeModal();
                setTimeout(() => location.reload(), 500);

            } catch (error) {
                console.error("Error executing AI plan:", error);
                showToast(error.message || 'Error al ejecutar el plan.', 'error');
                const modifiedPlanForReview = { ...currentPlan, executionPlan: modifiedExecutionPlan };
                renderReviewView(modifiedPlanForReview);
            }
        });
    };

    // --- Step 2: Loading View ---
    const renderLoadingView = (userPrompt) => {
        viewContainer.innerHTML = getAIAssistantLoadingViewHTML('Generando plan con IA...');
        lucide.createIcons();
        const thinkingStepsContainer = viewContainer.querySelector('#thinking-steps-container');

        // Call the backend function
        (async () => {
            try {
                const agentFn = httpsCallable(functions, 'aiProjectAgent');
                const allTasks = await fetchAllTasks();
                const userTasks = allTasks.filter(task => task.assigneeUid === appState.currentUser.uid);
                const currentDate = new Date().toISOString().split('T')[0];

                const result = await agentFn({ userPrompt, tasks: userTasks, currentDate });
                const plan = result.data;

                if (!plan.thoughtProcess || !plan.executionPlan || !plan.thinkingSteps) {
                    throw new Error("La IA devolvió un plan con un formato inesperado.");
                }

                // --- Enrich Plan with Original Titles (Fix for "undefined" task bug) ---
                const taskTitleMap = new Map();
                allTasks.forEach(t => taskTitleMap.set(t.docId, t.title));
                plan.executionPlan.forEach(action => {
                    if (action.action === 'CREATE') taskTitleMap.set(action.docId, action.task.title);
                });
                plan.executionPlan.forEach(action => {
                    if (action.action === 'UPDATE') action.originalTitle = taskTitleMap.get(action.docId) || 'Tarea no encontrada';
                });
                // --- End of Enrichment ---

                // --- Animate Loading Messages ---
                thinkingStepsContainer.innerHTML = ''; // Clear initial message
                const loadingMessages = [
                    "Analizando la petición inicial...",
                    "Consultando la base de conocimientos...",
                    "Esbozando un plan de acción...",
                    "Definiendo los pasos principales...",
                    "Añadiendo detalles y dependencias...",
                    "Finalizando y preparando la revisión..."
                ];
                let messageIndex = 0;

                function showNextMessage() {
                    if (messageIndex < loadingMessages.length) {
                        const message = loadingMessages[messageIndex];
                        const p = document.createElement('p');
                        p.className = 'flex items-start gap-2 text-slate-600 dark:text-slate-300 animate-fade-in';
                        p.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-green-500 flex-shrink-0 mt-1"></i><span>${message}</span>`;
                        thinkingStepsContainer.appendChild(p);
                        lucide.createIcons({ nodes: [p.querySelector('i')] });
                        thinkingStepsContainer.scrollTop = thinkingStepsContainer.scrollHeight;
                        messageIndex++;
                        // This timeout is just for the animation effect.
                        // The actual backend call is running in parallel.
                        setTimeout(showNextMessage, 750);
                    }
                }
                showNextMessage(); // Start the animation

                // The backend call has already finished, so we just wait a bit for the animation to "catch up"
                // before showing the final plan. This creates a better perceived performance.
                const totalAnimationTime = loadingMessages.length * 750;
                setTimeout(() => {
                    renderReviewView(plan);
                }, totalAnimationTime);

            } catch (error) {
                console.error("Error calling getAIAssistantPlan:", error);
                showToast(error.message || 'Ocurrió un error al contactar al Asistente IA.', 'error');
                renderPromptView(userPrompt); // Go back to prompt on failure
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
                    // Move cursor to the end
                    promptTextarea.setSelectionRange(promptTextarea.value.length, promptTextarea.value.length);
                }
            }
        });
    };

    // Initial render
    renderPromptView();
}
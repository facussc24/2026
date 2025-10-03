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
        lucide.createIcons();
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const handleJobUpdate = (doc) => {
        const jobData = doc.data();
        const loadingBubble = document.getElementById('ai-loading-bubble');
        if (!jobData) return;

        if (jobData.status === 'COMPLETED') {
            if (jobUnsubscribe) jobUnsubscribe();
            loadingBubble?.remove();
            if (jobData.summary) {
                addMessage('ai', jobData.summary, 'text');
            } else if (jobData.executionPlan && jobData.executionPlan.length > 0) {
                addMessage('ai', { plan: jobData, taskTitleMap: new Map() }, 'plan');
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

    modalElement.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        if (action === 'close') {
            closeModal();
        } else if (action === 'confirm-ai-plan') {
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5 mr-2"></i>Ejecutando...';
            lucide.createIcons();

            const planData = JSON.parse(button.dataset.plan);
            const executePlanFn = httpsCallable(functions, 'executeTaskModificationPlan');

            try {
                await executePlanFn({ plan: planData.executionPlan, jobId: planData.jobId });

                const modalContent = document.getElementById('ai-modal-content');
                modalContent.innerHTML = getAIAssistantExecutionProgressViewHTML(planData);
                lucide.createIcons();

                const executionUnsubscribe = onSnapshot(doc(db, "plan_executions", planData.jobId), (doc) => {
                    const executionData = doc.data();
                    if (!executionData) return;

                    // FIX: Ensure executionData.steps is an array before calling forEach
                    const steps = executionData.steps || [];
                    steps.forEach((step, index) => {
                        const stepEl = document.getElementById(`exec-step-${index + 1}`);
                        if (!stepEl) return;
                        const statusIcon = stepEl.querySelector('.status-icon');
                        const statusText = stepEl.querySelector('.status-text');

                        if (step.status === 'completed') {
                            statusIcon.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500"></i>';
                            statusText.textContent = 'Completado';
                            stepEl.classList.add('opacity-70');
                        } else if (step.status === 'error') {
                            statusIcon.innerHTML = '<i data-lucide="x-circle" class="w-5 h-5 text-red-500"></i>';
                            statusText.textContent = `Error: ${step.error || 'Desconocido'}`;
                            stepEl.classList.add('bg-red-50');
                        }
                    });

                    if (executionData.status === 'completed' || executionData.status === 'error') {
                        if (executionUnsubscribe) executionUnsubscribe();
                        const finalThought = document.getElementById('execution-final-thought');
                        if (finalThought) {
                           finalThought.innerHTML = `<p class="text-sm text-slate-600 dark:text-slate-400 mt-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg"><strong>Resumen final:</strong> ${executionData.summary || 'El plan ha finalizado.'}</p>`;
                        }
                        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
                    }
                });

            } catch (error) {
                console.error("Error executing plan:", error);
                showToast(`Error al ejecutar el plan: ${error.message}`, 'error');
                button.disabled = false;
                button.innerHTML = 'Confirmar y Ejecutar Plan';
            }
        }
    });

    // Initial greeting from AI
    addMessage('ai', 'Hola, soy tu asistente de IA. ¿Cómo puedo ayudarte a organizar tus tareas hoy?');
}
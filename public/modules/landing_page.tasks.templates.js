import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

function sanitizeHTML(html) {
    if (!html) return '';

    if (typeof window !== 'undefined' && window.DOMPurify) {
        return window.DOMPurify.sanitize(html);
    }

    const ParserClass = typeof DOMParser !== 'undefined'
        ? DOMParser
        : (typeof window !== 'undefined' ? window.DOMParser : null);

    if (ParserClass) {
        try {
            const parser = new ParserClass();
            const doc = parser.parseFromString(html, 'text/html');
            return doc?.body?.textContent?.trim() ? doc.body.textContent : '';
        } catch (error) {
            console.warn('No se pudo sanear HTML mediante DOMParser:', error);
        }
    }

    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getSubtaskHTML(subtask) {
    const safeSubtaskId = subtask.id?.replace(/[^a-zA-Z0-9_-]/g, '') || `sub_${Date.now()}`;
    const safeCheckboxId = `${safeSubtaskId}_checkbox`;
    const containerClass = subtask.completed ? 'border border-green-200 bg-green-50/60' : 'border border-transparent';
    const titleClass = subtask.completed ? 'line-through text-slate-400' : 'text-slate-600';
    const safeTitle = sanitizeHTML(subtask.title || '');

    return `
        <div class="subtask-item group flex items-center gap-3 p-2 bg-slate-100 hover:bg-slate-200/70 rounded-md transition-all duration-150 ${containerClass}" data-subtask-id="${safeSubtaskId}">
            <label for="${safeCheckboxId}" class="flex-grow flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="${safeCheckboxId}" name="${safeCheckboxId}" class="subtask-checkbox h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" ${subtask.completed ? 'checked' : ''}>
                <span class="flex-grow text-sm font-medium ${titleClass}">${safeTitle}</span>
            </label>
            <button type="button" class="subtask-delete-btn text-slate-400 hover:text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
        </div>
    `;
}

export function getTaskFormModalHTML(task, defaultStatus, selectedUid, defaultDate, isAdmin) {
    const isEditing = task !== null;

    let dependenciesSectionHTML = '';
    if (isEditing && ((task.dependsOnDetails && task.dependsOnDetails.length > 0) || (task.blocksDetails && task.blocksDetails.length > 0))) {
        const dependsOnList = (task.dependsOnDetails || []).map(t =>
            `<span class="cursor-pointer bg-yellow-100 text-yellow-800 text-sm font-medium px-3 py-1 rounded-full hover:bg-yellow-200 transition-colors" data-action="view-task" data-task-id="${t.docId}" title="Ver tarea '${t.title}'">${t.title}</span>`
        ).join('');

        const blocksList = (task.blocksDetails || []).map(t =>
            `<span class="cursor-pointer bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full hover:bg-blue-200 transition-colors" data-action="view-task" data-task-id="${t.docId}" title="Ver tarea '${t.title}'">${t.title}</span>`
        ).join('');

        dependenciesSectionHTML = `
            <div class="task-form-section">
                 <div class="form-section-header">
                    <i data-lucide="git-merge" class="w-5 h-5"></i>
                    <h4>Dependencias</h4>
                </div>
                <div class="p-4 space-y-4">
                    ${dependsOnList ? `
                        <div>
                            <h5 class="text-sm font-semibold text-slate-600 mb-2">Esta tarea depende de (prerrequisitos):</h5>
                            <div class="flex flex-wrap gap-2">
                                ${dependsOnList}
                            </div>
                        </div>
                    ` : ''}
                    ${blocksList ? `
                        <div>
                            <h5 class="text-sm font-semibold text-slate-600 mb-2">Esta tarea bloquea a:</h5>
                            <div class="flex flex-wrap gap-2">
                                ${blocksList}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    let tagsSectionHTML = '';
    if (isEditing && task.tags && task.tags.length > 0) {
        tagsSectionHTML = `
            <div class="task-form-section">
                 <div class="form-section-header">
                    <i data-lucide="tags" class="w-5 h-5"></i>
                    <h4>Etiquetas (generadas por IA)</h4>
                </div>
                <div class="p-4">
                    <div class="flex flex-wrap gap-2">
                        ${task.tags.map(tag => `<span class="bg-gray-200 text-gray-800 text-sm font-medium px-3 py-1 rounded-full">${tag}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    return `
    <div id="task-form-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div id="task-modal-content-container" class="bg-slate-50 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
            <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-white rounded-t-lg sticky top-0">
                <h3 class="text-xl font-bold text-slate-800">${isEditing ? 'Editar' : 'Nueva'} Tarea</h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
            </div>
            <form id="task-form" class="p-6 overflow-y-auto space-y-6" novalidate>
                <input type="hidden" name="taskId" value="${isEditing ? task.docId : ''}">
                <input type="hidden" name="status" value="${isEditing ? task.status : defaultStatus}">

                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="file-text" class="w-5 h-5"></i>
                        <h4>Detalles Principales</h4>
                    </div>
                    <div class="p-4 space-y-4">
                        <div class="input-group">
                            <label for="task-title">Título</label>
                            <input type="text" id="task-title" name="title" value="${isEditing && task.title ? task.title : ''}" required>
                        </div>
                        <div class="input-group">
                            <label for="task-description">Descripción</label>
                            <textarea id="task-description" name="description" rows="4">${isEditing && task.description ? task.description : ''}</textarea>
                        </div>
                    </div>
                </div>

                ${dependenciesSectionHTML}

                ${tagsSectionHTML}

                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="calendar-clock" class="w-5 h-5"></i>
                        <h4>Planificación</h4>
                    </div>
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="input-group md:col-span-2">
                            <label for="task-assignee">Responsable</label>
                            <select id="task-assignee" name="assigneeUid" data-selected-uid="${selectedUid}" ${isEditing ? '' : ''}>
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
                            <label for="task-effort">Esfuerzo Estimado</label>
                            <select id="task-effort" name="effort">
                                <option value="low" ${isEditing && task.effort === 'low' ? 'selected' : ''}>Bajo</option>
                                <option value="medium" ${!isEditing || (isEditing && task.effort === 'medium') ? 'selected' : ''}>Medio</option>
                                <option value="high" ${isEditing && task.effort === 'high' ? 'selected' : ''}>Alto</option>
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
                         <div class="input-group">
                            <label for="task-planneddate">Fecha Planificada</label>
                            <input type="date" id="task-planneddate" name="plannedDate" value="${isEditing && task.plannedDate ? task.plannedDate : ''}">
                        </div>
                    </div>
                </div>

                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="check-square" class="w-5 h-5"></i>
                        <h4>Sub-tareas</h4>
                    </div>
                    <div class="p-4">
                        <div id="subtasks-list" class="space-y-2 max-h-48 overflow-y-auto p-2 rounded-md bg-slate-100 border"></div>
                        <div class="flex items-center gap-2 mt-2">
                            <input type="text" id="new-subtask-title" placeholder="Añadir sub-tarea y presionar Enter">
                        </div>
                    </div>
                </div>

                <div class="task-form-section">
                    <div class="form-section-header">
                        <i data-lucide="message-square" class="w-5 h-5"></i>
                        <h4>Comentarios</h4>
                    </div>
                    <div class="p-4">
                        <div id="task-comments-list" class="space-y-3 max-h-60 overflow-y-auto p-3 rounded-md bg-slate-100 border custom-scrollbar">
                            <p class="text-xs text-center text-slate-400 py-2">Cargando comentarios...</p>
                        </div>
                        <div class="flex items-start gap-2 mt-2">
                            <textarea id="new-task-comment" placeholder="Escribe un comentario..." rows="2"></textarea>
                            <button type="button" id="post-comment-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold h-full">
                                <i data-lucide="send" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>
                </div>

                ${isAdmin ? `
                <div class="task-form-section p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="task-is-public" name="isPublic" class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isEditing && task.isPublic ? 'checked' : ''}>
                        <span>Tarea Pública (Visible para todos en Ingeniería)</span>
                    </label>
                </div>
                ` : ''}
            </form>
            <div class="flex justify-end items-center p-4 border-t border-slate-200 bg-white/70 backdrop-blur-sm sticky bottom-0">
                ${isEditing ? `<button data-action="delete" class="text-red-600 font-semibold mr-auto px-4 py-2 rounded-md hover:bg-red-50">Eliminar Tarea</button>` : ''}
                <button data-action="close" type="button" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold">Cancelar</button>
                <button type="submit" form="task-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold ml-3">Guardar Tarea</button>
            </div>
        </div>
    </div>
    `;
}

export function getMultiTaskConfirmationHTML(suggestedTasks) {
    const tasksHTML = suggestedTasks.map(task => {
        const sanitizedTitle = sanitizeHTML(task.title || '');
        const sanitizedDescription = sanitizeHTML(task.description || '');
        return `
            <div class="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
                <h4 class="font-semibold text-slate-800">${sanitizedTitle}</h4>
                <p class="text-sm text-slate-600 mt-2">${sanitizedDescription}</p>
                <div class="flex gap-2 mt-3">
                    <button data-action="accept-suggested-task" data-task='${JSON.stringify(task)}' class="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors">
                        <i data-lucide="check" class="w-4 h-4 mr-2"></i>Aceptar
                    </button>
                    <button data-action="reject-suggested-task" class="flex-1 bg-slate-100 text-slate-700 px-3 py-2 rounded-md text-sm font-semibold hover:bg-slate-200 transition-colors">
                        <i data-lucide="x" class="w-4 h-4 mr-2"></i>Descartar
                    </button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="space-y-4">
            ${tasksHTML}
        </div>
    `;
}

export function getAIAssistantReviewViewHTML(plan, taskTitleMap) {
    const thoughtProcessHTML = plan.thoughtProcess
        ? `<div class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <h4 class="text-sm font-semibold text-purple-600 dark:text-purple-300 uppercase tracking-wide">Resumen del análisis</h4>
                <p class="text-sm text-slate-700 dark:text-slate-200 mt-2">${sanitizeHTML(plan.thoughtProcess)}</p>
           </div>`
        : '';

    const sanitySuggestionsHTML = Array.isArray(plan.sanitySuggestions) && plan.sanitySuggestions.length > 0
        ? `<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h4 class="text-sm font-semibold text-amber-600 dark:text-amber-300 uppercase tracking-wide">Sugerencias del asistente</h4>
                <ul class="list-disc pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-2">
                    ${plan.sanitySuggestions.map(suggestion => `<li>${sanitizeHTML(suggestion)}</li>`).join('')}
                </ul>
           </div>`
        : '';

    const executionPlanHTML = Array.isArray(plan.executionPlan) && plan.executionPlan.length > 0
        ? plan.executionPlan.map((action, index) => {
            const actionTitle = action.action === 'CREATE'
                ? `Crear nueva tarea`
                : action.action === 'UPDATE'
                    ? `Actualizar tarea`
                    : action.action === 'DELETE'
                        ? `Eliminar tarea`
                        : 'Acción';

            const associatedTaskTitle = action.docId ? sanitizeHTML(taskTitleMap.get(action.docId) || action.originalTitle || action.docId) : '';

            return `
                <div class="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800/80">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Paso ${index + 1}: ${actionTitle}</h4>
                            ${associatedTaskTitle ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Tarea relacionada: <span class="font-medium">${associatedTaskTitle}</span></p>` : ''}
                        </div>
                        <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <input type="checkbox" name="action_${index}_enabled" checked class="rounded border-slate-300 text-purple-600 focus:ring-purple-500">
                            Incluir
                        </label>
                    </div>

                    <div class="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                        ${action.description ? `<p>${sanitizeHTML(action.description)}</p>` : ''}

                        ${action.action === 'CREATE' ? `
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="flex flex-col gap-1">
                                    <label class="block text-xs font-semibold text-slate-500">Título sugerido</label>
                                    <input id="action_${index}_title" class="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value="${sanitizeHTML(action.task?.title || '')}">
                                </div>
                                <div class="flex flex-col gap-1">
                                    <label class="block text-xs font-semibold text-slate-500">Fecha límite</label>
                                    <input id="action_${index}_dueDate" type="date" class="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" value="${action.task?.dueDate || ''}">
                                </div>
                                <div class="md:col-span-2 flex flex-col gap-1">
                                    <label class="block text-xs font-semibold text-slate-500">Sub-tareas propuestas</label>
                                    <textarea id="action_${index}_subtasks" class="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm" rows="2" placeholder="Una sub-tarea por línea">${Array.isArray(action.task?.subtasks) ? action.task.subtasks.map(st => st.title).join('\n') : ''}</textarea>
                                </div>
                            </div>
                        ` : ''}

                        ${action.action === 'UPDATE' ? `
                            <input type="hidden" name="action_${index}_docId" value="${sanitizeHTML(action.docId || '')}">
                            <div class="space-y-2">
                                ${(action.updates || []).map((update, updateIndex) => `
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div class="flex flex-col gap-1">
                                            <label class="block text-xs font-semibold text-slate-500">Campo a actualizar</label>
                                            <input type="text" name="action_${index}_update_field_${updateIndex}" value="${sanitizeHTML(update.field || '')}" class="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label class="block text-xs font-semibold text-slate-500">Nuevo valor</label>
                                            <input type="text" name="action_${index}_update_value_${updateIndex}" value="${sanitizeHTML(typeof update.value === 'string' ? update.value : JSON.stringify(update.value || ''))}" class="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('')
        : `<p class="text-sm text-slate-600 dark:text-slate-300">La IA no propuso acciones automáticas para esta consulta.</p>`;

    return `
        <div class="space-y-4" data-plan-container="true">
            ${thoughtProcessHTML}
            ${sanitySuggestionsHTML}
            <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i data-lucide="bot" class="w-5 h-5 text-purple-500"></i>
                        Plan de ejecución sugerido
                    </h3>
                    <div class="flex items-center gap-2">
                        <button id="ai-reject-plan-btn" data-action="reject-ai-plan" class="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                            Rechazar plan
                        </button>
                        <button id="ai-confirm-plan-btn" data-action="confirm-ai-plan" class="bg-purple-600 text-white px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-purple-700 transition-colors">
                            <i data-lucide="check-check" class="w-4 h-4 mr-1"></i>Confirmar y Ejecutar
                        </button>
                    </div>
                </div>
                <form id="ai-execution-plan-form" class="space-y-4">
                    <textarea id="ai-plan-json" class="hidden" readonly></textarea>
                    ${executionPlanHTML}
                </form>
            </div>
            ${plan.summary ? `<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 class="text-sm font-semibold text-blue-600 dark:text-blue-300 uppercase tracking-wide">Resumen final</h4>
                <div class="prose prose-sm dark:prose-invert max-w-none mt-2">${sanitizeHTML(marked.parse(plan.summary || ''))}</div>
            </div>` : ''}
        </div>
    `;
}

export function getAILoadingMessageHTML() {
    return `
        <div id="ai-loading-bubble" class="flex items-center gap-3 my-4">
            <div class="bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl shadow-md px-4 py-3 flex items-center gap-3">
                <i data-lucide="loader" class="w-5 h-5 animate-spin text-purple-500"></i>
                <span class="text-sm font-medium">El asistente está pensando...</span>
            </div>
        </div>
    `;
}

export function getAIChatModalHTML() {
    return `
    <div id="ai-assistant-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div id="ai-assistant-modal-content" class="bg-slate-100 dark:bg-slate-900 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 animate-scale-in transition-all duration-300">
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-lg">
                <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                    <i data-lucide="bot" class="w-6 h-6 text-purple-500"></i>
                    Asistente de IA
                </h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <i data-lucide="x" class="h-6 w-6"></i>
                </button>
            </div>
            <div id="ai-chat-messages" class="flex-grow p-6 overflow-y-auto custom-scrollbar">
            </div>
            <div class="p-4 bg-white/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 backdrop-blur-sm">
                <form id="ai-chat-form" class="flex items-center gap-3">
                    <textarea id="ai-chat-input" class="flex-grow bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg p-3 text-base focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none" placeholder="Escribe tu petición..." rows="1"></textarea>
                    <button type="submit" id="ai-chat-send-btn" class="bg-purple-600 text-white rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0 hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <i data-lucide="send" class="w-6 h-6"></i>
                    </button>
                </form>
            </div>
        </div>
    </div>
    `;
}

export function getAIChatMessageHTML(sender, content, type = 'text') {
    const isUser = sender === 'user';
    const alignClass = isUser ? 'justify-end' : 'justify-start';
    const bubbleClass = isUser
        ? 'bg-blue-600 text-white rounded-br-none'
        : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none';

    let messageContent = '';
    if (type === 'plan') {
        messageContent = getAIAssistantReviewViewHTML(content.plan, content.taskTitleMap);
    } else {
        const sanitizedContent = sanitizeHTML(marked.parse(content || ''));
        messageContent = `<div class="prose prose-sm dark:prose-invert max-w-none">${sanitizedContent}</div>`;
    }

    return `
        <div class="flex items-start gap-3 my-4 animate-fade-in-up ${alignClass}">
            ${!isUser ? '<i data-lucide="bot" class="w-8 h-8 text-purple-500 flex-shrink-0"></i>' : ''}
            <div class="max-w-2xl">
                <div class="p-4 rounded-xl shadow-md ${bubbleClass}">
                    ${messageContent}
                </div>
            </div>
        </div>
    `;
}

export function getAIAssistantExecutionProgressViewHTML(steps) {
    const stepsHTML = steps.map((step, index) => {
        const statusLabel = step.status === 'completed'
            ? 'Completado'
            : step.status === 'error'
                ? 'Error'
                : 'Pendiente';

        return `
        <li id="execution-step-${index}" class="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg transition-all duration-300">
            <div class="flex flex-col">
                <span class="font-medium text-slate-700 dark:text-slate-300 text-sm">${step.description}</span>
                <span class="status-text text-xs text-slate-500 dark:text-slate-400">${statusLabel}</span>
            </div>
            <div class="status-icon" data-status="${step.status}">
                <i data-lucide="loader-circle" class="w-5 h-5 animate-spin text-slate-400"></i>
            </div>
        </li>`;
    }).join('');

    return `
        <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
            <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                <i data-lucide="bot" class="w-6 h-6 text-purple-500"></i>
                <span id="execution-status-text">Ejecutando Plan de la IA</span>
            </h3>
            <button data-action="close" class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors hidden" id="execution-close-btn">
                <i data-lucide="x" class="h-6 w-6"></i>
            </button>
        </div>
        <div class="p-6 flex-grow overflow-y-auto">
            <ul id="execution-steps-list" class="space-y-2">
                ${stepsHTML}
            </ul>
        </div>
        <div class="p-4 bg-white/70 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 backdrop-blur-sm text-right space-y-3">
            <div id="execution-final-thought"></div>
            <button id="execution-complete-close-btn" type="button" data-action="close" class="bg-purple-600 text-white px-5 py-2 rounded-md hover:bg-purple-700 font-semibold transition-colors flex items-center gap-2" disabled>
                <i data-lucide="loader-circle" class="w-5 h-5 animate-spin"></i>
                <span>Ejecutando...</span>
            </button>
        </div>
    `;
}

export function getPlannerHelpModalHTML() {
    return `
        <div id="planner-help-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
                <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                    <div class="flex items-center gap-3">
                        <div class="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-full">
                            <i data-lucide="help-circle" class="text-blue-600 dark:text-blue-400 h-6 w-6"></i>
                        </div>
                        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Guía del Planificador Semanal</h3>
                    </div>
                    <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 overflow-y-auto prose dark:prose-invert max-w-none">
                    <p>¡Bienvenido al planificador! Aquí tienes una guía rápida para sacarle el máximo provecho.</p>

                    <h4 class="text-blue-600 dark:text-blue-400">El Analista IA 🤖</h4>
                    <p>
                        El botón <strong class="text-purple-600">Analista IA</strong> es tu asistente personal. Analiza todas tus tareas de la semana (incluyendo vencidas y sin fecha) y te propone un plan optimizado.
                        La IA prioriza por ti, colocando lo más urgente al principio de la semana. ¡Úsalo para organizar tu semana con un solo clic!
                    </p>

                    <h4 class="text-blue-600 dark:text-blue-400">Arrastra y suelta</h4>
                    <p>
                        Puedes arrastrar tareas entre los días de la semana para reprogramarlas rápidamente. Cuando arrastras una tarea a un día, su fecha planificada se actualiza automáticamente.
                    </p>

                    <h4 class="text-blue-600 dark:text-blue-400">Leyenda de prioridades</h4>
                    <p>
                        Los colores indican la prioridad: <span class="text-red-600 font-semibold">Rojo</span> para alta, <span class="text-yellow-600 font-semibold">Amarillo</span> para media y <span class="text-green-600 font-semibold">Verde</span> para baja.
                    </p>

                    <h4 class="text-blue-600 dark:text-blue-400">Tareas bloqueadas</h4>
                    <p>
                        Marca una tarea como bloqueada cuando dependa de otra acción. Esto te ayuda a identificar qué tareas requieren atención antes de poder completarlas.
                    </p>
                </div>
            </div>
        </div>
    `;
}

export function getTasksModalHTML(title) {
    return `
        <div id="tasks-list-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4 animate-scale-in">
                <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">${title}</h3>
                    <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div id="modal-tasks-container" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"></div>
            </div>
        </div>
    `;
}


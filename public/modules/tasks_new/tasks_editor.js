/**
 * @fileoverview Editor modal reutilizable para crear y actualizar tareas desde
 * DayPilot. Resuelve validaciones, carga de recursos y respeta los modos de
 * solo lectura según rol/previewRole.
 */

import {
    createTask,
    updateTask,
    deleteTask,
    listResources,
    TasksNewValidationError
} from './tasks_service.js';

const DEFAULT_DURATION_MINUTES = 60;

const editorState = {
    getIsReadOnly: () => true,
    refreshData: async () => {},
    getTaskById: () => null,
    getResources: () => [],
    fetchResources: () => listResources(),
    convertDayPilotDate: (value) => {
        if (value?.toDate) {
            try {
                return value.toDate();
            } catch (error) {
                console.warn('[TasksNew][Editor] Failed to convert DayPilot date via toDate()', error);
            }
        }

        if (value instanceof Date) {
            return value;
        }

        if (value && typeof value === 'object' && 'value' in value) {
            const parsed = new Date(value.value);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }

        const fallback = new Date(value);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
};

function isReadOnly() {
    try {
        return editorState.getIsReadOnly();
    } catch (error) {
        console.warn('[TasksNew][Editor] Failed to evaluate read-only state.', error);
        return true;
    }
}

function showToast(message, type = 'info', duration) {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(message, type, duration);
    } else {
        console.log(`[TasksNew][Editor][Toast:${type}]`, message);
    }
}

function formatDateForInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }

    const pad = (value) => value.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function ensureDuration(start, end) {
    if (start && end) {
        return { start, end };
    }

    if (!start) {
        start = new Date();
    }

    const resolvedEnd = end
        ? end
        : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

    return { start, end: resolvedEnd };
}

async function ensureResources() {
    try {
        const cached = editorState.getResources();
        if (Array.isArray(cached) && cached.length) {
            return cached;
        }

        const fetched = await editorState.fetchResources();
        return Array.isArray(fetched) ? fetched : [];
    } catch (error) {
        console.warn('[TasksNew][Editor] Failed to resolve resources.', error);
        return [];
    }
}

function closeModal(modalEl) {
    if (!modalEl) return;
    if (typeof modalEl.__tasksNewCleanup === 'function') {
        try {
            modalEl.__tasksNewCleanup();
        } catch (error) {
            console.warn('[TasksNew][Editor] Failed to run modal cleanup.', error);
        }
        modalEl.__tasksNewCleanup = null;
    }
    if (modalEl.parentNode) {
        modalEl.parentNode.removeChild(modalEl);
    }
}

function fillSelectOptions(selectEl, options, selectedValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Sin asignar';
    selectEl.appendChild(placeholder);

    options.forEach((option) => {
        if (!option || !option.id) {
            return;
        }
        const el = document.createElement('option');
        el.value = option.id;
        el.textContent = option.name || option.email || option.id;
        if (selectedValue && selectedValue === option.id) {
            el.selected = true;
        }
        selectEl.appendChild(el);
    });
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildModal({ mode, task, defaults }) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm';

    const title = mode === 'edit' ? 'Editar tarea' : 'Nueva tarea';

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div class="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                <h2 class="text-lg font-semibold text-slate-800">${title}</h2>
                <button type="button" class="text-slate-500 hover:text-slate-800" data-action="close">
                    <i data-lucide="x" class="h-5 w-5"></i>
                </button>
            </div>
            <form class="flex-1 overflow-y-auto p-6 space-y-4" novalidate>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-slate-700" for="tasksnew-title">Título *</label>
                    <input id="tasksnew-title" name="title" type="text" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required value="${escapeHtml(task?.title || '')}">
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-slate-700" for="tasksnew-description">Descripción</label>
                    <textarea id="tasksnew-description" name="description" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">${escapeHtml(task?.description || '')}</textarea>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-start">Inicio *</label>
                        <input id="tasksnew-start" name="start" type="datetime-local" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required value="${defaults.startValue}">
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-end">Fin *</label>
                        <input id="tasksnew-end" name="end" type="datetime-local" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required value="${defaults.endValue}">
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-status">Estado</label>
                        <select id="tasksnew-status" name="status" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            ${['todo', 'inprogress', 'done'].map(status => `<option value="${status}" ${task?.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-priority">Prioridad</label>
                        <select id="tasksnew-priority" name="priority" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            ${['low', 'med', 'high'].map(priority => `<option value="${priority}" ${task?.priority === priority ? 'selected' : ''}>${priority}</option>`).join('')}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-assignedTo">Asignado a</label>
                        <select id="tasksnew-assignedTo" name="assignedTo" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-slate-700" for="tasksnew-resource">Recurso (Timeline)</label>
                        <select id="tasksnew-resource" name="resource" class="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
                    </div>
                </div>
                <p class="text-sm text-red-600 min-h-[1.25rem]" data-role="error"></p>
            </form>
            <div class="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50">
                <div>
                    ${mode === 'edit' ? '<button type="button" class="text-red-600 hover:text-red-700 font-medium" data-action="delete">Eliminar</button>' : ''}
                </div>
                <div class="flex items-center gap-3">
                    <button type="button" class="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100" data-action="close">Cancelar</button>
                    <button type="submit" class="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700" data-action="submit">Guardar</button>
                </div>
            </div>
        </div>
    `;

    return modal;
}

function readFormData(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    return {
        title: data.title?.trim() || '',
        description: data.description?.trim() || '',
        start: data.start ? new Date(data.start) : null,
        end: data.end ? new Date(data.end) : null,
        status: data.status || 'todo',
        priority: data.priority || 'med',
        assignedTo: data.assignedTo || null,
        resource: data.resource || data.assignedTo || null,
    };
}

function hydrateSelects(modal, resources, task) {
    const assignedSelect = modal.querySelector('#tasksnew-assignedTo');
    const resourceSelect = modal.querySelector('#tasksnew-resource');

    fillSelectOptions(assignedSelect, resources, task?.assignedTo || task?.resource || '');
    fillSelectOptions(resourceSelect, resources, task?.resource || task?.assignedTo || '');
}

async function handleSubmit({ mode, taskId, modal, form }) {
    const submitButton = modal.querySelector('[data-action="submit"]');
    const errorEl = modal.querySelector('[data-role="error"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';
    }

    errorEl.textContent = '';

    try {
        const payload = readFormData(form);

        if (mode === 'edit' && taskId) {
            await updateTask(taskId, payload);
        } else {
            await createTask(payload);
        }

        closeModal(modal);
        await editorState.refreshData();
        showToast('Tarea guardada correctamente.', 'success');
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            errorEl.textContent = error.message;
        } else {
            console.error('[TasksNew][Editor] Failed to persist task.', error);
            errorEl.textContent = 'No se pudo guardar la tarea. Intentalo de nuevo.';
        }
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar';
        }
    }
}

async function handleDelete({ taskId, modal }) {
    if (!taskId) return;

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const confirmed = window.confirm('¿Seguro querés eliminar esta tarea?');
        if (!confirmed) {
            return;
        }
    }

    try {
        await deleteTask(taskId);
        closeModal(modal);
        await editorState.refreshData();
        showToast('Tarea eliminada.', 'success');
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            showToast(error.message, 'error');
        } else {
            console.error('[TasksNew][Editor] Failed to delete task.', error);
            showToast('No se pudo eliminar la tarea.', 'error');
        }
        return;
    }
}

function wireModalEvents({ modal, mode, taskId }) {
    const form = modal.querySelector('form');
    const submitButton = modal.querySelector('[data-action="submit"]');

    const onSubmit = (event) => {
        event.preventDefault();
        handleSubmit({ mode, taskId, modal, form });
    };

    form.addEventListener('submit', onSubmit);

    const onClick = async (event) => {
        const target = event.target.closest('button');
        if (!target) return;

        const action = target.dataset.action;
        if (action === 'close') {
            closeModal(modal);
        } else if (action === 'delete') {
            await handleDelete({ taskId, modal });
        } else if (action === 'submit' && submitButton) {
            submitButton.blur();
        }
    };

    modal.addEventListener('click', onClick);

    const cleanup = () => {
        form.removeEventListener('submit', onSubmit);
        modal.removeEventListener('click', onClick);
    };

    modal.__tasksNewCleanup = cleanup;
}

function mountModal(modal) {
    document.body.appendChild(modal);
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

function resolveTaskDefaults(task, defaults) {
    const start = task?.start || defaults.start;
    const end = task?.end || defaults.end;
    const ensured = ensureDuration(start, end);

    return {
        startValue: formatDateForInput(ensured.start),
        endValue: formatDateForInput(ensured.end),
    };
}

function normalizeDateInput(value) {
    if (!value) return null;
    const converted = editorState.convertDayPilotDate(value);
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
}

/**
 * Inyecta dependencias compartidas y callbacks de refresco para el editor.
 *
 * @param {object} options - Callbacks y helpers compartidos.
 * @param {Function} options.getIsReadOnly - Determina si el usuario puede editar.
 * @param {Function} options.refreshData - Refresca vistas tras persistir cambios.
 * @param {Function} options.getTaskById - Busca tareas en cache local.
 * @param {Function} options.getResources - Obtiene recursos cacheados.
 * @param {Function} options.fetchResources - Forza lectura de recursos.
 * @param {Function} options.convertDayPilotDate - Normaliza fechas DayPilot → Date.
 * Side effects: actualiza `editorState` con punteros a funciones externas.
 */
export function initTasksEditor(options = {}) {
    Object.assign(editorState, options || {});
}

/**
 * Despliega el modal para crear una tarea precargando datos del rango elegido.
 *
 * @param {{start?: any, end?: any, resource?: string}} payload - Valores sugeridos.
 * @returns {Promise<void>} Resuelve tras cerrar el modal.
 * Side effects: puede escribir en Firestore y refrescar vistas.
 */
export async function openCreate({ start, end, resource } = {}) {
    if (isReadOnly()) {
        showToast('No tenés permisos para crear tareas.', 'warning');
        return;
    }

    const defaults = ensureDuration(
        normalizeDateInput(start) || new Date(),
        normalizeDateInput(end)
    );

    const modal = buildModal({
        mode: 'create',
        task: null,
        defaults: resolveTaskDefaults(null, defaults),
    });

    mountModal(modal);

    const resources = await ensureResources();
    hydrateSelects(modal, resources, { assignedTo: resource, resource });

    wireModalEvents({ modal, mode: 'create', taskId: null });
}

/**
 * Abre el modal de edición para una tarea existente.
 *
 * @param {string} taskId - Identificador de la tarea a modificar.
 * @returns {Promise<void>} Finaliza al cerrar el modal.
 * Side effects: puede actualizar o eliminar registros en Firestore y refrescar la UI.
 */
export async function openEdit(taskId) {
    if (!taskId) {
        return;
    }

    if (isReadOnly()) {
        showToast('No tenés permisos para editar tareas.', 'warning');
        return;
    }

    const task = editorState.getTaskById(taskId);
    if (!task) {
        showToast('No se encontró la tarea seleccionada. Actualizando vista...', 'info');
        await editorState.refreshData();
        return;
    }

    const defaults = ensureDuration(task.start, task.end);

    const modal = buildModal({
        mode: 'edit',
        task,
        defaults: resolveTaskDefaults(task, defaults),
    });

    mountModal(modal);

    const resources = await ensureResources();
    hydrateSelects(modal, resources, task);

    wireModalEvents({ modal, mode: 'edit', taskId });
}

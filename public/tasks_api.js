import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

import { COLLECTIONS } from './utils.js';
import {
    createTask as createTaskNew,
    updateTask as updateTaskNew,
    deleteTask as deleteTaskNew,
    listTasks as listTasksNew,
    TasksNewValidationError
} from './modules/tasks_new/tasks_service.js';
import { fetchAllTasks as fetchAllTasksLegacy } from './modules/tasks/task.service.js';

const DEFAULT_DURATION_MINUTES = 60;

const DEFAULT_TASKS_NEW_FEATURE = {
    enabled: false,
    visibleForRoles: ['admin'],
};

const tasksApiState = {
    appState: null,
    features: {},
    db: null,
};

function ensureDb() {
    if (!tasksApiState.db) {
        throw new Error('[TasksAPI] Firestore no está inicializado.');
    }
}

function getFeatureFlags() {
    const merged = {
        tasksNew: { ...DEFAULT_TASKS_NEW_FEATURE },
    };

    if (typeof window !== 'undefined' && window.appConfig?.features) {
        Object.assign(merged, window.appConfig.features);
    }

    if (tasksApiState.features) {
        Object.assign(merged, tasksApiState.features);
    }

    merged.tasksNew = normalizeTasksNewFeatureFlag(merged.tasksNew);

    return merged;
}

function shouldUseNewModule() {
    const feature = getFeatureFlags().tasksNew;
    const role = getEffectiveRole();

    if (!isRoleAllowedForTasksNew(feature, role)) {
        return false;
    }

    if (tasksApiState.appState?.currentView === 'tasks-new') {
        return true;
    }

    return feature.enabled;
}

function getUsersCollection() {
    const { appState } = tasksApiState;
    if (!appState) return [];

    const users = [];
    const seen = new Set();

    const pushUser = (user) => {
        if (!user) return;
        const key = user.docId || user.id || user.uid;
        if (!key || seen.has(key)) return;
        seen.add(key);
        users.push(user);
    };

    const arrayUsers = appState.collections?.[COLLECTIONS.USUARIOS];
    if (Array.isArray(arrayUsers)) {
        arrayUsers.forEach(pushUser);
    }

    const mapUsers = appState.collectionsById?.[COLLECTIONS.USUARIOS];
    if (mapUsers && typeof mapUsers.values === 'function') {
        for (const user of mapUsers.values()) {
            pushUser(user);
        }
    }

    return users;
}

function normalizeTasksNewFeatureFlag(value) {
    if (value === undefined) {
        return { ...DEFAULT_TASKS_NEW_FEATURE };
    }

    if (typeof value === 'boolean') {
        return {
            ...DEFAULT_TASKS_NEW_FEATURE,
            enabled: value,
        };
    }

    if (value && typeof value === 'object') {
        const normalized = {
            ...DEFAULT_TASKS_NEW_FEATURE,
            ...value,
        };
        normalized.enabled = Boolean(normalized.enabled);

        if (Array.isArray(value.visibleForRoles)) {
            const cleaned = value.visibleForRoles
                .map(role => (role == null ? '' : String(role).trim()))
                .filter(Boolean);
            normalized.visibleForRoles = cleaned.length > 0
                ? Array.from(new Set(cleaned))
                : [...DEFAULT_TASKS_NEW_FEATURE.visibleForRoles];
        } else {
            normalized.visibleForRoles = [...DEFAULT_TASKS_NEW_FEATURE.visibleForRoles];
        }

        return normalized;
    }

    return { ...DEFAULT_TASKS_NEW_FEATURE };
}

function isRoleAllowedForTasksNew(feature, role) {
    if (!feature?.enabled) {
        return false;
    }

    const allowedRoles = Array.isArray(feature.visibleForRoles)
        ? feature.visibleForRoles
        : [];

    if (allowedRoles.length === 0) {
        return true;
    }

    if (!role) {
        return false;
    }

    return allowedRoles.includes(role);
}

function getEffectiveRole() {
    const previewRole = tasksApiState.appState?.previewRole;
    if (previewRole) {
        return previewRole;
    }

    if (tasksApiState.appState?.currentUser?.isSuperAdmin) {
        return 'admin';
    }

    return tasksApiState.appState?.currentUser?.role || null;
}

function bumpTelemetry(metric, context = {}) {
    if (typeof window === 'undefined') {
        return;
    }

    const telemetry = window.TasksNewTelemetry;
    if (telemetry && typeof telemetry.increment === 'function') {
        try {
            telemetry.increment(metric, context);
        } catch (error) {
            console.warn('[TasksAPI] No se pudo registrar telemetría.', error);
        }
    }
}

function normalizeStatus(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (['inprogress', 'in_progress', 'progress', 'doing'].includes(normalized)) {
        return 'inprogress';
    }
    if (['done', 'completed', 'complete', 'terminada', 'terminado'].includes(normalized)) {
        return 'done';
    }
    return 'todo';
}

function normalizePriority(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (['low', 'baja', 'l'].includes(normalized)) {
        return 'low';
    }
    if (['high', 'alta', 'h'].includes(normalized)) {
        return 'high';
    }
    if (['medium', 'med', 'media', 'm'].includes(normalized)) {
        return 'med';
    }
    return 'med';
}

function mapPriorityToLegacy(priorityCode) {
    if (priorityCode === 'low') return 'low';
    if (priorityCode === 'high') return 'high';
    return 'medium';
}

function normalizeTimeInput(value) {
    if (value === undefined || value === null) {
        return null;
    }
    let time = value.toString().trim();
    if (!time) return null;
    if (/^\d{1,2}$/.test(time)) {
        return `${time.padStart(2, '0')}:00`;
    }
    time = time.replace(/[h\.]/g, ':');
    if (/^\d{1,2}:\d{2}$/.test(time)) {
        return time;
    }
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
        return time;
    }
    return null;
}

function parseDateTime(input) {
    if (!input && input !== 0) {
        return null;
    }

    if (input instanceof Date) {
        const date = new Date(input.getTime());
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof input === 'number') {
        const date = new Date(input);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return new Date(`${trimmed}T00:00:00`);
        }

        let candidate = trimmed;
        if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}(:\d{2})?$/.test(candidate)) {
            candidate = candidate.replace(' ', 'T');
        }

        const parsed = new Date(candidate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }

        const timeOnly = normalizeTimeInput(candidate);
        if (timeOnly) {
            const now = new Date();
            const [hours, minutes, seconds = '0'] = timeOnly.split(':');
            now.setHours(Number(hours), Number(minutes), Number(seconds), 0);
            return now;
        }

        return null;
    }

    if (typeof input === 'object') {
        if (input.iso) {
            return parseDateTime(input.iso);
        }
        if (typeof input.millis === 'number') {
            return parseDateTime(input.millis);
        }
        if (input.date || input.day || input.time || input.hour || input.startTime) {
            const datePart = input.date || input.day || null;
            const baseDate = datePart ? parseDateTime(String(datePart)) : new Date();
            if (!baseDate) {
                return null;
            }
            const timePart = input.time || input.hour || input.startTime || null;
            const time = normalizeTimeInput(timePart);
            const result = new Date(baseDate.getTime());
            if (time) {
                const [hours, minutes, seconds = '0'] = time.split(':');
                result.setHours(Number(hours), Number(minutes), Number(seconds), 0);
            } else {
                result.setHours(0, 0, 0, 0);
            }
            if (typeof input.offsetMinutes === 'number' && !Number.isNaN(input.offsetMinutes)) {
                result.setMinutes(result.getMinutes() - Number(input.offsetMinutes));
            }
            return result;
        }
    }

    return null;
}

function inferEndDate(start, providedEnd, durationMinutes = DEFAULT_DURATION_MINUTES) {
    if (providedEnd && providedEnd > start) {
        return providedEnd;
    }
    const minutes = Math.max(Number(durationMinutes) || DEFAULT_DURATION_MINUTES, 1);
    return new Date(start.getTime() + minutes * 60 * 1000);
}

function toDateOnlyString(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resolveAssigneeIdentifier(value) {
    if (!value && value !== 0) {
        return null;
    }

    if (typeof value === 'object') {
        if (value.id) return value.id;
        if (value.uid) return value.uid;
        if (value.assigneeUid) return value.assigneeUid;
        if (value.email) {
            return resolveAssigneeIdentifier(value.email);
        }
        if (value.name) {
            return resolveAssigneeIdentifier(value.name);
        }
    }

    const input = value.toString().trim();
    if (!input) return null;
    const normalized = input.toLowerCase();
    const users = getUsersCollection();

    let partialMatch = null;

    for (const user of users) {
        const id = user.docId || user.id || user.uid;
        const email = (user.email || '').toLowerCase();
        const name = (user.name || '').toLowerCase();
        const alias = email.includes('@') ? email.split('@')[0] : email;

        if (id && normalized === id.toLowerCase()) {
            return id;
        }
        if (email && normalized === email) {
            return id;
        }
        if (alias && normalized === alias) {
            return id;
        }
        if (name && normalized === name) {
            return id;
        }
        if (!partialMatch && name && name.includes(normalized)) {
            partialMatch = id;
        } else if (!partialMatch && email && email.includes(normalized)) {
            partialMatch = id;
        }
    }

    if (partialMatch) {
        return partialMatch;
    }

    if (/^[a-z0-9_-]{6,}$/i.test(input)) {
        return input;
    }

    return null;
}

function normalizeTaskInput(task) {
    if (!task || typeof task !== 'object') {
        throw new Error('Los datos de la tarea son obligatorios.');
    }

    const title = (task.title || '').trim();
    if (!title) {
        throw new Error('El título es obligatorio.');
    }

    const start = parseDateTime(task.start ?? task.startDate ?? task.plannedDate ?? task.from);
    if (!start) {
        throw new Error('La fecha de inicio es obligatoria.');
    }

    const providedEnd = parseDateTime(task.end ?? task.endDate ?? task.dueDate ?? task.to ?? task.finish);
    const end = inferEndDate(start, providedEnd, task.durationMinutes);

    const status = normalizeStatus(task.status);
    const priority = normalizePriority(task.priority);

    const resolvedAssignee = resolveAssigneeIdentifier(
        task.assignedTo ?? task.resource ?? task.assigneeUid ?? task.assigneeEmail ?? task.assignee
    );

    return {
        title,
        description: task.description || '',
        start,
        end,
        status,
        priority,
        color: task.color || task.backColor || '#0f62fe',
        assignedTo: resolvedAssignee,
        resource: resolvedAssignee,
    };
}

function normalizeUpdateInput(partial) {
    if (!partial || typeof partial !== 'object') {
        throw new Error('Debe proporcionar cambios para actualizar.');
    }

    const data = {};
    let hasField = false;

    if (Object.prototype.hasOwnProperty.call(partial, 'title')) {
        const title = (partial.title || '').trim();
        if (!title) {
            throw new Error('El título es obligatorio.');
        }
        data.title = title;
        hasField = true;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'description')) {
        data.description = partial.description || '';
        hasField = true;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'status')) {
        data.status = normalizeStatus(partial.status);
        hasField = true;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'priority')) {
        data.priority = normalizePriority(partial.priority);
        hasField = true;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'color')) {
        data.color = partial.color || '#0f62fe';
        hasField = true;
    }

    const hasStartUpdate = ['start', 'startDate', 'plannedDate', 'from'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasStartUpdate) {
        const startValue = partial.start ?? partial.startDate ?? partial.plannedDate ?? partial.from;
        const normalizedStart = parseDateTime(startValue);
        if (!normalizedStart) {
            throw new Error('La fecha de inicio es inválida.');
        }
        data.start = normalizedStart;
        hasField = true;
    }

    const hasEndUpdate = ['end', 'endDate', 'dueDate', 'to', 'finish'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasEndUpdate) {
        const endValue = partial.end ?? partial.endDate ?? partial.dueDate ?? partial.to ?? partial.finish;
        const normalizedEnd = parseDateTime(endValue);
        if (!normalizedEnd) {
            throw new Error('La fecha de fin es inválida.');
        }
        data.end = normalizedEnd;
        hasField = true;
    }

    const hasAssignmentUpdate = ['assignedTo', 'resource', 'assigneeUid', 'assigneeEmail', 'assignee'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasAssignmentUpdate) {
        const resolved = resolveAssigneeIdentifier(
            partial.assignedTo ?? partial.resource ?? partial.assigneeUid ?? partial.assigneeEmail ?? partial.assignee
        );
        data.assignedTo = resolved;
        data.resource = resolved;
        hasField = true;
    }

    if (!hasField) {
        throw new Error('No se proporcionaron cambios para actualizar.');
    }

    return data;
}

function applyLegacyCompatibility(payload, {
    start,
    end,
    startProvided = false,
    endProvided = false,
    assigned,
    assignedProvided,
    priorityCode,
    priorityProvided,
}) {
    if (!payload || typeof payload !== 'object') {
        return;
    }

    if (startProvided && start instanceof Date && !Number.isNaN(start.getTime())) {
        const startDateOnly = toDateOnlyString(start);
        payload.start = start;
        payload.startDate = startDateOnly;
        payload.plannedDate = startDateOnly;
    }

    if (endProvided && end instanceof Date && !Number.isNaN(end.getTime())) {
        payload.end = end;
        payload.dueDate = toDateOnlyString(end);
    }

    if (assignedProvided) {
        payload.assignedTo = assigned || null;
        payload.resource = assigned || null;
        payload.assigneeUid = assigned || null;
    }

    if (priorityProvided) {
        const plannerPriority = priorityCode || 'med';
        payload.priorityCode = plannerPriority;
        payload.priority = mapPriorityToLegacy(plannerPriority);
    }

    payload.updatedAt = new Date();
}

function buildLegacyPayload(task) {
    const startDateOnly = toDateOnlyString(task.start);
    const endDateOnly = toDateOnlyString(task.end);
    const priorityCode = normalizePriority(task.priority);
    const assigned = task.assignedTo || task.resource || null;

    const payload = {
        title: task.title,
        description: task.description || '',
        status: normalizeStatus(task.status),
        color: task.color || '#0f62fe',
        createdAt: new Date(),
    };

    applyLegacyCompatibility(payload, {
        start: task.start,
        end: task.end,
        startProvided: true,
        endProvided: true,
        assigned,
        assignedProvided: true,
        priorityCode,
        priorityProvided: true,
    });

    payload.startDate = startDateOnly;
    payload.plannedDate = startDateOnly;
    payload.dueDate = endDateOnly;
    payload.effort = task.effort || 'medium';
    return payload;
}

function formatTaskForApi(task) {
    if (!task) return null;
    const start = task.start instanceof Date ? task.start : parseDateTime(task.start);
    const end = task.end instanceof Date ? task.end : parseDateTime(task.end);
    return {
        id: task.id || task.docId || null,
        title: task.title || '',
        description: task.description || '',
        start: start ? start.toISOString() : null,
        end: end ? end.toISOString() : null,
        status: normalizeStatus(task.status),
        priority: normalizePriority(task.priority || task.priorityCode),
        assignedTo: task.assignedTo || task.assigneeUid || task.resource || null,
        resource: task.resource || task.assignedTo || task.assigneeUid || null,
        color: task.color || '#0f62fe',
    };
}

function formatLegacyTask(docId, data) {
    const start = data.start instanceof Date
        ? data.start
        : data.start?.toDate?.()
            ? data.start.toDate()
            : parseDateTime(data.startDate || data.plannedDate);

    const end = data.end instanceof Date
        ? data.end
        : data.end?.toDate?.()
            ? data.end.toDate()
            : parseDateTime(data.dueDate);

    return formatTaskForApi({
        id: docId,
        title: data.title,
        description: data.description,
        start,
        end,
        status: data.status,
        priority: data.priorityCode || data.priority,
        assignedTo: data.assignedTo || data.assigneeUid,
        resource: data.resource || data.assignedTo || data.assigneeUid,
        color: data.color,
    });
}

function withinRange(task, from, to) {
    if (!from && !to) return true;
    const start = parseDateTime(task.start ?? task.startDate ?? task.plannedDate);
    const end = parseDateTime(task.end ?? task.dueDate);

    const effectiveStart = start || (end ? new Date(end.getTime() - 60 * 60 * 1000) : null);
    const effectiveEnd = end || (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);

    if (from && effectiveEnd && effectiveEnd < from) return false;
    if (to && effectiveStart && effectiveStart > to) return false;
    return true;
}

function matchesTerm(task, term) {
    if (!term) return true;
    const haystack = [task.title, task.description, task.id]
        .filter(Boolean)
        .map(value => value.toString().toLowerCase())
        .join(' ');
    return haystack.includes(term);
}

function matchesLegacyTerm(task, term) {
    if (!term) return true;
    const keywords = Array.isArray(task.search_keywords) ? task.search_keywords.join(' ') : '';
    const haystack = [task.title, task.description, keywords]
        .filter(Boolean)
        .map(value => value.toString().toLowerCase())
        .join(' ');
    return haystack.includes(term);
}

function normalizeFilterInput(filters = {}) {
    const assignedInput = filters.assignedTo ?? filters.resource ?? filters.assignee ?? filters.assigneeUid ?? null;
    const assignedTrimmed = assignedInput ? assignedInput.toString().trim() : null;
    const resolvedAssigned = assignedTrimmed ? resolveAssigneeIdentifier(assignedTrimmed) : null;
    return {
        assignedTo: resolvedAssigned ?? assignedTrimmed,
        status: filters.status ? normalizeStatus(filters.status) : null,
        priority: filters.priority ? normalizePriority(filters.priority) : null,
    };
}

async function createLegacyTask(task) {
    ensureDb();
    const payload = buildLegacyPayload(task);
    const tasksRef = collection(tasksApiState.db, COLLECTIONS.TAREAS);
    const docRef = await addDoc(tasksRef, payload);
    const snapshot = await getDoc(docRef);
    const data = snapshot.exists() ? snapshot.data() : payload;
    return formatLegacyTask(docRef.id, data);
}

async function updateLegacyTask(id, updates) {
    ensureDb();
    const taskRef = doc(tasksApiState.db, COLLECTIONS.TAREAS, id);
    const snapshot = await getDoc(taskRef);
    if (!snapshot.exists()) {
        throw new Error('La tarea indicada no existe.');
    }

    const existing = snapshot.data() || {};
    const existingStart = existing.start?.toDate?.() || parseDateTime(existing.startDate || existing.plannedDate);
    const existingEnd = existing.end?.toDate?.() || parseDateTime(existing.dueDate);

    const start = updates.start || existingStart || null;
    const end = updates.end || existingEnd || null;
    const startProvided = Object.prototype.hasOwnProperty.call(updates, 'start');
    const endProvided = Object.prototype.hasOwnProperty.call(updates, 'end');
    const assignedProvided = Object.prototype.hasOwnProperty.call(updates, 'assignedTo') ||
        Object.prototype.hasOwnProperty.call(updates, 'resource');
    const assigned = assignedProvided
        ? updates.assignedTo ?? updates.resource ?? null
        : existing.assignedTo || existing.resource || existing.assigneeUid || null;
    const priorityProvided = Object.prototype.hasOwnProperty.call(updates, 'priority');
    const priorityCode = priorityProvided
        ? updates.priority
        : existing.priorityCode || normalizePriority(existing.priority);

    const payload = { ...updates };
    applyLegacyCompatibility(payload, {
        start,
        end,
        startProvided,
        endProvided,
        assigned,
        assignedProvided,
        priorityCode,
        priorityProvided,
    });

    await updateDoc(taskRef, payload);
}

async function deleteLegacyTask(id) {
    ensureDb();
    const taskRef = doc(tasksApiState.db, COLLECTIONS.TAREAS, id);
    await deleteDoc(taskRef);
}

function filterLegacyTask(task, filters) {
    if (filters.assignedTo) {
        const assignedMatches = task.assignedTo === filters.assignedTo;
        const resourceMatches = task.resource === filters.assignedTo;
        if (!assignedMatches && !resourceMatches) {
            return false;
        }
    }
    if (filters.status && normalizeStatus(task.status) !== filters.status) {
        return false;
    }
    if (filters.priority) {
        const normalizedPriority = normalizePriority(task.priorityCode || task.priority);
        if (normalizedPriority !== filters.priority) {
            return false;
        }
    }
    return true;
}

function notifyChange(action, taskId) {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('ai-tasks-updated', {
        detail: {
            source: 'tasks-api',
            action,
            taskId: taskId || null,
        }
    }));
}

function handleError(action, error) {
    console.error(`[TasksAPI] Error en la acción "${action}":`, error);
    bumpTelemetry('errorsCaptured', {
        action,
        message: error?.message || null,
        code: error?.code || null,
    });
}

async function createNewTask(task) {
    const result = await createTaskNew(task);
    const id = result?.id || null;
    return formatTaskForApi({
        id,
        ...task,
    });
}

export async function create(taskInput) {
    const normalized = normalizeTaskInput(taskInput);
    const useNewModule = shouldUseNewModule();
    try {
        const result = useNewModule
            ? await createNewTask(normalized)
            : await createLegacyTask(normalized);
        if (useNewModule) {
            bumpTelemetry('aiCreations', {
                taskId: result?.id || null,
                source: 'TasksAPI.create',
            });
        }
        notifyChange('create', result?.id || null);
        return result;
    } catch (error) {
        handleError('create', error);
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        throw new Error(error?.message || 'No se pudo crear la tarea.');
    }
}

export async function update(id, partial) {
    if (!id) {
        throw new Error('El ID de la tarea es obligatorio.');
    }
    const normalized = normalizeUpdateInput(partial);
    try {
        if (shouldUseNewModule()) {
            await updateTaskNew(id, normalized);
        } else {
            await updateLegacyTask(id, normalized);
        }
        notifyChange('update', id);
        return true;
    } catch (error) {
        handleError('update', error);
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        throw new Error(error?.message || 'No se pudo actualizar la tarea.');
    }
}

export async function remove(id) {
    if (!id) {
        throw new Error('El ID de la tarea es obligatorio.');
    }
    try {
        if (shouldUseNewModule()) {
            await deleteTaskNew(id);
        } else {
            await deleteLegacyTask(id);
        }
        notifyChange('delete', id);
        return true;
    } catch (error) {
        handleError('delete', error);
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        throw new Error(error?.message || 'No se pudo eliminar la tarea.');
    }
}

export async function findByDate(options = {}) {
    const { from = null, to = null, filters = {} } = options;
    const start = parseDateTime(from);
    const end = parseDateTime(to);
    const normalizedFilters = normalizeFilterInput(filters);

    try {
        if (shouldUseNewModule()) {
            const tasks = await listTasksNew({
                from: start || null,
                to: end || null,
                filters: normalizedFilters,
            });
            return tasks.map(formatTaskForApi);
        }

        const legacyTasks = await fetchAllTasksLegacy();
        return legacyTasks
            .filter(task => withinRange(task, start, end))
            .filter(task => filterLegacyTask(task, normalizedFilters))
            .map(task => formatLegacyTask(task.docId || task.id, task));
    } catch (error) {
        handleError('findByDate', error);
        throw new Error('No se pudieron consultar las tareas por fecha.');
    }
}

export async function findByText(text, options = {}) {
    const term = (text || '').toString().trim().toLowerCase();
    const normalizedFilters = normalizeFilterInput(options.filters || {});
    if (!term) {
        return [];
    }

    try {
        if (shouldUseNewModule()) {
            const tasks = await listTasksNew({ filters: normalizedFilters });
            return tasks
                .filter(task => filterLegacyTask(task, normalizedFilters))
                .map(formatTaskForApi)
                .filter(task => matchesTerm(task, term));
        }

        const legacyTasks = await fetchAllTasksLegacy();
        return legacyTasks
            .filter(task => filterLegacyTask(task, normalizedFilters))
            .filter(task => matchesLegacyTerm(task, term))
            .map(task => formatLegacyTask(task.docId || task.id, task));
    } catch (error) {
        handleError('findByText', error);
        throw new Error('No se pudieron buscar las tareas por texto.');
    }
}

function getTasksApiPublicInterface() {
    return {
        create,
        update,
        delete: remove,
        remove,
        findByDate,
        findByText,
    };
}

export function initTasksAPI({ appState, features = {}, db } = {}) {
    tasksApiState.appState = appState || null;
    tasksApiState.features = features || {};
    tasksApiState.db = db || null;

    if (typeof window !== 'undefined') {
        window.TasksAPI = Object.assign(window.TasksAPI || {}, getTasksApiPublicInterface());
    }
}

export default {
    initTasksAPI,
    create,
    update,
    delete: remove,
    findByDate,
    findByText,
};

/**
 * @fileoverview Servicio centralizado de tareas para el módulo TasksNew.
 * Provee CRUD contra Firestore, validaciones de negocio y adaptadores DayPilot
 * reutilizados por calendario, timeline y la API de IA. Los métodos exponen
 * efectos secundarios como toasts, logs y escritura remota.
 */

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    or,
    query,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

import { COLLECTIONS } from '../../utils.js';

class TasksNewValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TasksNewValidationError';
    }
}

let db = null;
let appState = null;

function readDebugFlag() {
    if (typeof window === 'undefined') {
        return false;
    }

    const flag = window.DEBUG_TASKS;
    if (flag === true) return true;
    if (typeof flag === 'string') {
        const normalized = flag.trim().toLowerCase();
        return ['true', '1', 'yes', 'on'].includes(normalized);
    }
    return false;
}

function getEffectiveRole() {
    const previewRole = appState?.previewRole;
    if (previewRole) {
        return String(previewRole).toLowerCase();
    }
    const currentRole = appState?.currentUser?.role;
    return currentRole ? String(currentRole).toLowerCase() : null;
}

/**
 * Indica si el modo detallado de logs está habilitado (solo admins o flag).
 *
 * @returns {boolean} Verdadero cuando `DEBUG_TASKS` o rol admin permiten loguear.
 */
export function isDebugLoggingEnabled() {
    if (!readDebugFlag()) {
        return false;
    }
    return getEffectiveRole() === 'admin';
}

/**
 * Emite mensajes de depuración encapsulados.
 *
 * @param {string} message - Texto principal para el log.
 * @param {object} context - Datos adicionales opcionales.
 * Side effects: imprime en consola cuando `DEBUG_TASKS` está activo.
 */
export function debugLog(message, context = {}) {
    if (!isDebugLoggingEnabled()) {
        return;
    }

    try {
        console.debug('[TasksNew][Debug]', message, context);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.log('[TasksNew][Debug:Fallback]', message, context, error);
    }
}

/**
 * Permite inyectar Firestore y estado global desde `main.js`.
 *
 * @param {{db?: import('firebase/firestore').Firestore, appState?: object}} dependencies
 *        Conjunto de referencias compartidas con el resto de la app.
 * Side effects: cachea db/appState para los métodos CRUD siguientes.
 */
export function initTasksService(dependencies = {}) {
    if (dependencies.db) {
        db = dependencies.db;
    }
    if (dependencies.appState) {
        appState = dependencies.appState;
    }
    debugLog('Servicio de tareas inicializado.', {
        hasDb: Boolean(db),
        hasAppState: Boolean(appState),
    });
}

function ensureDb() {
    if (!db) {
        throw new Error('[TasksNew] El servicio de tareas no fue inicializado.');
    }
}

function toastError(message) {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(message, 'error');
    } else {
        console.error('[TasksNew][Toast]', message);
    }
}

function handleServiceError(error, fallbackMessage) {
    console.error('[TasksNew][Service] Operation failed:', error);
    const isPermissionIssue = error?.code === 'permission-denied';
    debugLog('Operación del servicio fallida.', {
        code: error?.code,
        fallbackMessage,
    });
    const message = isPermissionIssue
        ? 'No tenés permisos para realizar esta acción. Contactá a un administrador si necesitás acceso.'
        : `${fallbackMessage} Revisá tu conexión e intentá nuevamente.`;
    toastError(message);
}

function normalizeDateInput(value, fieldName) {
    if (!value) return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new TasksNewValidationError(`La fecha de ${fieldName} es inválida.`);
        }
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new TasksNewValidationError(`La fecha de ${fieldName} es inválida.`);
    }
    return parsed;
}

function deserializeDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatusValue(value) {
    const normalized = (value || '').toString().trim().toLowerCase();
    if (['inprogress', 'in_progress', 'progress', 'doing'].includes(normalized)) {
        return 'inprogress';
    }
    if (['done', 'completed', 'complete', 'terminada', 'terminado'].includes(normalized)) {
        return 'done';
    }
    return 'todo';
}

function normalizePlannerPriority(value) {
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

function mapLegacyPriorityToPlanner(priorityValue) {
    const normalized = (priorityValue || '').toString().trim().toLowerCase();
    if (normalized === 'low' || normalized === 'baja') return 'low';
    if (normalized === 'high' || normalized === 'alta') return 'high';
    if (normalized === 'med') return 'med';
    return 'med';
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

function applyLegacyCompatibilityFields(target, {
    start,
    end,
    assigned,
    assignedProvided,
    priorityCode,
    priorityProvided,
}) {
    if (!target || typeof target !== 'object') {
        return target;
    }

    if (start instanceof Date && !Number.isNaN(start.getTime())) {
        const startDateOnly = toDateOnlyString(start);
        target.startDate = startDateOnly;
        target.plannedDate = startDateOnly;
    }

    if (end instanceof Date && !Number.isNaN(end.getTime())) {
        target.dueDate = toDateOnlyString(end);
    }

    if (assignedProvided) {
        target.assignedTo = assigned || null;
        target.resource = assigned || null;
        target.assigneeUid = assigned || null;
    }

    if (priorityProvided) {
        const plannerPriority = priorityCode || 'med';
        target.priorityCode = plannerPriority;
        target.priority = mapPriorityToLegacy(plannerPriority);
    }

    return target;
}

function serializeTaskDocument(snapshot) {
    const data = snapshot.data() || {};
    const rawStart = deserializeDate(data.start) || deserializeDate(data.startDate) || deserializeDate(data.plannedDate);
    const rawEnd = deserializeDate(data.end) || deserializeDate(data.dueDate);
    let start = rawStart;
    let end = rawEnd;
    if (!start && rawEnd) {
        start = new Date(rawEnd.getTime() - 60 * 60 * 1000);
    }
    if (!end && rawStart) {
        end = new Date(rawStart.getTime() + 60 * 60 * 1000);
    }
    const priorityCode = data.priorityCode || mapLegacyPriorityToPlanner(data.priority);
    const assigned = data.assignedTo || data.assigneeUid || null;
    const resource = data.resource || assigned || null;
    const normalizedStatus = normalizeStatusValue(data.status);

    return {
        id: snapshot.id,
        title: data.title || '',
        description: data.description || '',
        start,
        end,
        status: normalizedStatus,
        priority: priorityCode || 'med',
        assignedTo: assigned,
        resource,
        color: data.color || '#0f62fe'
    };
}

function buildTaskPayload(task) {
    if (!task || typeof task !== 'object') {
        throw new TasksNewValidationError('Los datos de la tarea son obligatorios.');
    }

    const title = (task.title || '').trim();
    if (!title) {
        throw new TasksNewValidationError('El título de la tarea es obligatorio.');
    }

    const start = normalizeDateInput(task.start, 'inicio');
    const end = normalizeDateInput(task.end, 'fin');

    if (!start) {
        throw new TasksNewValidationError('La fecha de inicio es obligatoria.');
    }
    if (!end) {
        throw new TasksNewValidationError('La fecha de fin es obligatoria.');
    }
    if (end <= start) {
        throw new TasksNewValidationError('La fecha de fin debe ser posterior a la fecha de inicio.');
    }

    const status = normalizeStatusValue(task.status);
    const priorityCode = normalizePlannerPriority(task.priority);
    const assigned = task.assignedTo || task.resource || null;

    const payload = {
        title,
        description: task.description || '',
        start,
        end,
        status,
        color: task.color || '#0f62fe',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    applyLegacyCompatibilityFields(payload, {
        start,
        end,
        assigned,
        assignedProvided: true,
        priorityCode,
        priorityProvided: true,
    });

    return payload;
}

function buildPartialPayload(partial, existingDates = {}) {
    if (!partial || typeof partial !== 'object') {
        throw new TasksNewValidationError('Los datos a actualizar son obligatorios.');
    }

    const data = {};
    let start = existingDates.start instanceof Date ? new Date(existingDates.start) : null;
    let end = existingDates.end instanceof Date ? new Date(existingDates.end) : null;
    let assigned = existingDates.assignedTo || existingDates.resource || null;
    let startChanged = false;
    let endChanged = false;
    let assignedProvided = false;
    let priorityProvided = false;
    let priorityCode = null;

    if (Object.prototype.hasOwnProperty.call(partial, 'title')) {
        const title = (partial.title || '').trim();
        if (!title) {
            throw new TasksNewValidationError('El título de la tarea es obligatorio.');
        }
        data.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'description')) {
        data.description = partial.description || '';
    }

    const hasStartUpdate = ['start', 'startDate', 'plannedDate', 'from'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasStartUpdate) {
        const startValue = partial.start ?? partial.startDate ?? partial.plannedDate ?? partial.from;
        const normalizedStart = normalizeDateInput(startValue, 'inicio');
        if (!normalizedStart) {
            throw new TasksNewValidationError('La fecha de inicio es obligatoria.');
        }
        start = normalizedStart;
        data.start = normalizedStart;
        startChanged = true;
    }

    const hasEndUpdate = ['end', 'endDate', 'dueDate', 'to', 'finish'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasEndUpdate) {
        const endValue = partial.end ?? partial.endDate ?? partial.dueDate ?? partial.to ?? partial.finish;
        const normalizedEnd = normalizeDateInput(endValue, 'fin');
        if (!normalizedEnd) {
            throw new TasksNewValidationError('La fecha de fin es obligatoria.');
        }
        end = normalizedEnd;
        data.end = normalizedEnd;
        endChanged = true;
    }

    if (start && end && end <= start) {
        throw new TasksNewValidationError('La fecha de fin debe ser posterior a la fecha de inicio.');
    }

    const hasAssignmentUpdate = ['assignedTo', 'resource', 'assigneeUid'].some((key) =>
        Object.prototype.hasOwnProperty.call(partial, key)
    );

    if (hasAssignmentUpdate) {
        assignedProvided = true;
        const candidate = partial.assignedTo ?? partial.resource ?? partial.assigneeUid ?? null;
        assigned = candidate || null;
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'status')) {
        data.status = normalizeStatusValue(partial.status);
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'priority')) {
        priorityProvided = true;
        priorityCode = normalizePlannerPriority(partial.priority);
    } else if (Object.prototype.hasOwnProperty.call(partial, 'priorityCode')) {
        priorityProvided = true;
        priorityCode = normalizePlannerPriority(partial.priorityCode);
    }

    if (Object.prototype.hasOwnProperty.call(partial, 'color')) {
        data.color = partial.color || '#0f62fe';
    }

    if (
        Object.keys(data).length === 0 &&
        !startChanged &&
        !endChanged &&
        !assignedProvided &&
        !priorityProvided
    ) {
        throw new TasksNewValidationError('No se proporcionaron cambios para actualizar.');
    }

    data.updatedAt = new Date();

    applyLegacyCompatibilityFields(data, {
        start,
        end,
        assigned,
        assignedProvided,
        priorityCode,
        priorityProvided,
    });

    return data;
}

function filterTasksByRange(tasks, from, to) {
    if (!from && !to) return tasks;

    const fromDate = from ? normalizeDateInput(from, 'inicio') : null;
    const toDate = to ? normalizeDateInput(to, 'fin') : null;

    return tasks.filter(task => {
        const taskStart = task.start;
        const taskEnd = task.end;

        if (fromDate && taskEnd && taskEnd < fromDate) return false;
        if (toDate && taskStart && taskStart > toDate) return false;
        return true;
    });
}

function sanitizeFilterValue(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return sanitizeFilterValue(value[0]);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }

        const lower = trimmed.toLowerCase();
        if (lower === 'all' || lower === 'todos' || lower === 'todas') {
            return null;
        }

        return trimmed;
    }

    return value;
}

function sanitizeFilters(filters = {}) {
    return {
        assignedTo: sanitizeFilterValue(filters.assignedTo),
        status: sanitizeFilterValue(filters.status),
        priority: sanitizeFilterValue(filters.priority),
    };
}

function formatDateForEvent(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function getCachedUsers() {
    if (!appState?.collections?.[COLLECTIONS.USUARIOS]) return null;
    return appState.collections[COLLECTIONS.USUARIOS];
}

/**
 * Devuelve las tareas dentro de un rango opcional aplicando filtros por rol.
 *
 * @param {{from?: Date|string|null, to?: Date|string|null, filters?: object}} params
 *        Parámetros de búsqueda solicitados por las vistas.
 * @returns {Promise<Array<object>>} Tareas normalizadas listas para la UI.
 * Side effects: realiza lecturas a Firestore y muestra toasts ante errores.
 */
export async function listTasks({ from = null, to = null, filters = {} } = {}) {
    ensureDb();

    try {
        const tasksRef = collection(db, COLLECTIONS.TAREAS);
        const sanitizedFilters = sanitizeFilters(filters);
        const constraints = [];

        debugLog('Solicitando tareas desde Firestore.', {
            from,
            to,
            filters: sanitizedFilters,
        });

        if (sanitizedFilters.status) {
            constraints.push(where('status', '==', sanitizedFilters.status));
        }

        if (sanitizedFilters.priority) {
            const plannerPriority = normalizePlannerPriority(sanitizedFilters.priority);
            const legacyPriority = mapPriorityToLegacy(plannerPriority);
            constraints.push(
                or(
                    where('priorityCode', '==', plannerPriority),
                    where('priority', '==', legacyPriority)
                )
            );
        }

        if (sanitizedFilters.assignedTo) {
            constraints.push(where('resource', '==', sanitizedFilters.assignedTo));
        }

        const queryRef = constraints.length ? query(tasksRef, ...constraints) : query(tasksRef);
        const snapshot = await getDocs(queryRef);
        const tasks = snapshot.docs.map(serializeTaskDocument);
        const rangedTasks = filterTasksByRange(tasks, from, to);

        const filtered = rangedTasks.filter((task) => {
            if (sanitizedFilters.assignedTo) {
                const matchesAssigned = task.assignedTo === sanitizedFilters.assignedTo;
                const matchesResource = task.resource === sanitizedFilters.assignedTo;
                if (!matchesAssigned && !matchesResource) {
                    return false;
                }
            }

            if (sanitizedFilters.status && task.status !== sanitizedFilters.status) {
                return false;
            }

            if (sanitizedFilters.priority) {
                const plannerPriority = normalizePlannerPriority(sanitizedFilters.priority);
                if (task.priority !== plannerPriority) {
                    return false;
                }
            }

            return true;
        });

        debugLog('Tareas obtenidas.', {
            total: tasks.length,
            afterRangeFilter: rangedTasks.length,
            afterClientFilter: filtered.length,
        });

        return filtered;
    } catch (error) {
        handleServiceError(error, 'No se pudieron cargar las tareas.');
        throw error;
    }
}

/**
 * Crea una tarea nueva aplicando validaciones de negocio.
 *
 * @param {object} task - Payload a persistir.
 * @returns {Promise<{id: string}>} Identificador generado en Firestore.
 * Side effects: escribe en Firestore y dispara toasts/logs.
 */
export async function createTask(task) {
    ensureDb();

    const payload = buildTaskPayload(task);
    debugLog('Creando nueva tarea.', {
        title: payload.title,
        start: payload.start,
        end: payload.end,
        assignedTo: payload.assignedTo || payload.resource || null,
    });
    try {
        const docRef = await addDoc(collection(db, COLLECTIONS.TAREAS), payload);
        debugLog('Tarea creada con éxito.', { id: docRef.id });
        return { id: docRef.id };
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        handleServiceError(error, 'No se pudo crear la tarea.');
        throw error;
    }
}

/**
 * Actualiza campos puntuales de una tarea existente.
 *
 * @param {string} id - Identificador de la tarea en Firestore.
 * @param {object} partial - Subconjunto de campos permitidos.
 * @returns {Promise<void>} Resuelve cuando la actualización finaliza.
 * Side effects: escribe en Firestore y dispara toasts/logs.
 */
export async function updateTask(id, partial) {
    ensureDb();

    if (!id) {
        throw new TasksNewValidationError('El ID de la tarea es obligatorio para actualizar.');
    }

    try {
        const taskRef = doc(db, COLLECTIONS.TAREAS, id);
        const snapshot = await getDoc(taskRef);
        if (!snapshot.exists()) {
            throw new TasksNewValidationError('La tarea indicada no existe.');
        }

        const existing = serializeTaskDocument(snapshot);
        const payload = buildPartialPayload(partial, { start: existing.start, end: existing.end });
        debugLog('Actualizando tarea.', { id, payload });
        await updateDoc(taskRef, payload);
        debugLog('Tarea actualizada.', { id });
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        handleServiceError(error, 'No se pudo actualizar la tarea.');
        throw error;
    }
}

/**
 * Elimina una tarea del planificador.
 *
 * @param {string} id - Identificador del documento.
 * @returns {Promise<void>} Promesa resuelta al completar la eliminación.
 * Side effects: borra en Firestore y muestra toasts ante errores.
 */
export async function deleteTask(id) {
    ensureDb();

    if (!id) {
        throw new TasksNewValidationError('El ID de la tarea es obligatorio para eliminar.');
    }

    try {
        debugLog('Eliminando tarea.', { id });
        await deleteDoc(doc(db, COLLECTIONS.TAREAS, id));
        debugLog('Tarea eliminada.', { id });
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            throw error;
        }
        handleServiceError(error, 'No se pudo eliminar la tarea.');
        throw error;
    }
}

/**
 * Obtiene usuarios habilitados como recursos asignables.
 *
 * @returns {Promise<Array<{id: string, name: string}>>} Colección de recursos.
 * Side effects: consulta Firestore o cache local según disponibilidad.
 */
export async function listResources() {
    ensureDb();

    const cachedUsers = getCachedUsers();
    if (cachedUsers && cachedUsers.length > 0) {
        debugLog('Retornando recursos desde caché.', { total: cachedUsers.length });
        return cachedUsers
            .filter(user => user && user.disabled !== true)
            .map(user => ({
                id: user.docId || user.id || user.uid,
                name: user.name || user.email || 'Usuario sin nombre'
            }))
            .filter(resource => resource.id);
    }

    try {
        const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USUARIOS));
        const resources = usersSnapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(user => user.disabled !== true)
            .map(user => ({
                id: user.id,
                name: user.name || user.email || 'Usuario sin nombre'
            }));
        debugLog('Recursos obtenidos desde Firestore.', { total: resources.length });
        return resources;
    } catch (error) {
        handleServiceError(error, 'No se pudieron cargar los recursos.');
        throw error;
    }
}

/**
 * Transforma una tarea al formato requerido por DayPilot.Calendar.
 *
 * @param {object} task - Tarea normalizada.
 * @returns {{id: string, text: string, start: string|null, end: string|null, backColor?: string}}
 *          Evento listo para asignar vía `calendar.update`.
 */
export function toCalendarEvent(task) {
    if (!task) return null;
    const start = formatDateForEvent(task.start);
    const end = formatDateForEvent(task.end);
    if (!start || !end) return null;

    return {
        id: task.id,
        text: task.title,
        start,
        end,
        backColor: task.color || '#0f62fe'
    };
}

/**
 * Transforma una tarea al formato de DayPilot.Scheduler.
 *
 * @param {object} task - Tarea normalizada.
 * @returns {{id: string, text: string, start: string|null, end: string|null, resource?: string, barColor?: string}}
 *          Evento apto para el timeline.
 */
export function toSchedulerEvent(task) {
    if (!task) return null;
    const start = formatDateForEvent(task.start);
    const end = formatDateForEvent(task.end);
    if (!start || !end) return null;

    return {
        id: task.id,
        text: task.title,
        start,
        end,
        resource: task.resource || task.assignedTo || null,
        barColor: task.color || '#0f62fe'
    };
}

export { TasksNewValidationError };

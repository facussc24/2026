/**
 * @fileoverview Utilidades de UI para el módulo TasksNew. Normaliza filtros,
 * resuelve estados de vista preferida y configura escalas del timeline.
 * Funciones libres de efectos secundarios salvo cuando se indica explícitamente.
 */

export const VIEW_TYPES = Object.freeze({
    CALENDAR: 'calendar',
    TIMELINE: 'timeline',
});

export const TIMELINE_SCALES = Object.freeze({
    HOURS: 'hours',
    DAYS: 'days',
    WEEKS: 'weeks',
});

function normalizeSingleFilter(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (Array.isArray(value)) {
        return normalizeSingleFilter(value[0]);
    }

    const normalized = String(value).trim();
    if (!normalized || ['all', 'todos', 'todas'].includes(normalized.toLowerCase())) {
        return null;
    }

    return normalized;
}

/**
 * Limpia filtros provenientes de formularios/almacenamiento.
 *
 * @param {object} filters - Valores seleccionados por el usuario.
 * @returns {{assignedTo: string|null, status: string|null, priority: string|null}}
 *          Filtros listos para consultas y comparaciones.
 */
export function normalizeFilters(filters = {}) {
    return {
        assignedTo: normalizeSingleFilter(filters.assignedTo),
        status: normalizeSingleFilter(filters.status),
        priority: normalizeSingleFilter(filters.priority),
    };
}

/**
 * Aplica filtros en memoria sobre el arreglo de tareas renderizado.
 *
 * @param {Array<object>} tasks - Lista de tareas normalizadas.
 * @param {object} filters - Valores en crudo seleccionados por el usuario.
 * @returns {Array<object>} Subconjunto filtrado conservando referencia original.
 */
export function filterTasks(tasks = [], filters = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return [];
    }

    const normalized = normalizeFilters(filters);

    return tasks.filter((task) => {
        if (!task) {
            return false;
        }

        if (normalized.assignedTo) {
            const matchesAssigned = task.assignedTo === normalized.assignedTo;
            const matchesResource = task.resource === normalized.assignedTo;
            if (!matchesAssigned && !matchesResource) {
                return false;
            }
        }

        if (normalized.status && task.status !== normalized.status) {
            return false;
        }

        if (normalized.priority && task.priority !== normalized.priority) {
            return false;
        }

        return true;
    });
}

/**
 * Devuelve la configuración predefinida de escala para el timeline.
 *
 * @param {string} scale - Identificador (`hours`, `days`, `weeks`).
 * @returns {{cellDuration: number, scale: string, timeHeaders: Array<object>, snapToGrid: boolean}}
 *          Configuración compatible con DayPilot.Scheduler.update().
 */
export function getTimelineScaleConfig(scale = TIMELINE_SCALES.DAYS) {
    const normalized = Object.values(TIMELINE_SCALES).includes(scale) ? scale : TIMELINE_SCALES.DAYS;

    if (normalized === TIMELINE_SCALES.HOURS) {
        return {
            scale: 'CellDuration',
            cellDuration: 60,
            timeHeaders: [
                { groupBy: 'Day', format: 'dddd d/M' },
                { groupBy: 'Hour' },
            ],
        };
    }

    if (normalized === TIMELINE_SCALES.WEEKS) {
        return {
            scale: 'Week',
            cellDuration: null,
            timeHeaders: [
                { groupBy: 'Month', format: 'MMMM yyyy' },
                { groupBy: 'Week' },
            ],
        };
    }

    return {
        scale: 'Day',
        cellDuration: null,
        timeHeaders: [
            { groupBy: 'Month', format: 'MMMM yyyy' },
            { groupBy: 'Day', format: 'ddd d' },
        ],
    };
}

/**
 * Determina la vista final a mostrar considerando preferencias persistidas.
 *
 * @param {string} requestedView - Vista solicitada por UI/Storage.
 * @param {string} currentView - Vista activa actual como fallback.
 * @returns {string} Valor garantizado (`calendar` o `timeline`).
 */
export function resolveViewState(requestedView, currentView = VIEW_TYPES.CALENDAR) {
    const normalized = requestedView === VIEW_TYPES.TIMELINE ? VIEW_TYPES.TIMELINE : VIEW_TYPES.CALENDAR;
    const isCalendar = normalized === VIEW_TYPES.CALENDAR;

    return {
        activeView: normalized,
        calendarDisplay: isCalendar ? 'block' : 'none',
        schedulerDisplay: isCalendar ? 'none' : 'block',
        previousView: currentView,
    };
}

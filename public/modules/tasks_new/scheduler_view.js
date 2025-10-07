/**
 * @fileoverview Gestiona la vista tipo timeline (DayPilot.Scheduler) del nuevo
 * planificador. Configura recursos, escala y handlers compartidos con el editor
 * asegurando la paridad con el calendario.
 */

import { openCreate, openEdit } from './tasks_editor.js';
import { updateTask, TasksNewValidationError } from './tasks_service.js';

const noop = () => {};

function convertDayPilotDate(value) {
    if (value?.toDate) {
        try {
            return value.toDate();
        } catch (error) {
            console.warn('[TasksNew][Scheduler] Failed to convert DayPilot date via toDate()', error);
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

function showReadOnlyToast() {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast('Modo solo lectura: no podés modificar tareas.', 'info');
    }
}

function attachEventHandlers(scheduler, options) {
    const {
        onRangeChange = noop,
        onTaskChange = noop,
        convertDayPilotDate: externalConvert = convertDayPilotDate,
        isReadOnly = () => false,
    } = options || {};

    const toDate = (value) => externalConvert(value) || convertDayPilotDate(value);

    const clearSelection = () => {
        if (typeof scheduler.clearSelection === 'function') {
            scheduler.clearSelection();
        }
    };

    const normalizeResource = (resourceCandidate) => {
        if (!resourceCandidate) {
            return resourceCandidate ?? null;
        }

        if (typeof resourceCandidate === 'object' && 'id' in resourceCandidate) {
            return resourceCandidate.id;
        }

        return resourceCandidate;
    };

    scheduler.onTimeRangeSelected = async (args) => {
        clearSelection();
        if (isReadOnly()) {
            showReadOnlyToast();
            return;
        }

        await openCreate({
            start: args?.start,
            end: args?.end,
            resource: normalizeResource(args?.resource),
        });
    };

    scheduler.onEventClick = (args) => {
        if (isReadOnly()) {
            showReadOnlyToast();
            return;
        }

        const eventId = args?.e?.id?.();
        if (eventId) {
            openEdit(eventId);
        }
    };

    const handleEventChange = async (args) => {
        if (isReadOnly()) {
            args?.preventDefault?.();
            showReadOnlyToast();
            return;
        }

        const eventId = args?.e?.id?.();
        if (!eventId) {
            return;
        }

        const payload = {
            start: toDate(args?.newStart ?? args?.start),
            end: toDate(args?.newEnd ?? args?.end),
        };

        if (Object.prototype.hasOwnProperty.call(args ?? {}, 'newResource')) {
            payload.resource = normalizeResource(args.newResource);
        } else if (Object.prototype.hasOwnProperty.call(args ?? {}, 'resource')) {
            payload.resource = normalizeResource(args.resource);
        }

        try {
            await updateTask(eventId, payload);
            await onTaskChange();
        } catch (error) {
            if (error instanceof TasksNewValidationError) {
                if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(error.message, 'error');
                }
            } else {
                console.error('[TasksNew][Scheduler] Failed to update event after move/resize.', error);
            }
            await onTaskChange();
        }
    };

    scheduler.onEventMoved = handleEventChange;
    scheduler.onEventResized = handleEventChange;

    scheduler.onScroll = () => {
        onRangeChange();
    };
}

// Scheduler view bootstrap for the new tasks module.
/**
 * Construye la instancia de DayPilot.Scheduler y sincroniza escala/handlers.
 *
 * @param {object} options - Dependencias inyectadas desde index.js.
 * @param {HTMLElement} options.container - Nodo donde se renderiza el timeline.
 * @param {Function} options.onRangeChange - Callback cuando cambia el rango visible.
 * @param {Function} options.onTaskChange - Refresco tras operaciones CRUD.
 * @param {Function} options.onToggleView - Permite saltar al calendario.
 * @returns {DayPilot.Scheduler} Instancia configurada con escala inicial.
 * Side effects: registra listeners para crear/editar/mover tareas y actualizar recursos.
 */
export function initSchedulerView(options = {}) {
    if (!window.DayPilot || typeof window.DayPilot.Scheduler !== 'function') {
        console.warn('[TasksNew] DayPilot.Scheduler is unavailable.');
        return null;
    }

    const scheduler = new window.DayPilot.Scheduler('tasksnew-scheduler');
    scheduler.eventMoveHandling = 'Notify';
    scheduler.eventResizeHandling = 'Notify';
    scheduler.timeRangeSelectedHandling = 'Enabled';
    scheduler.eventClickHandling = 'Enabled';
    scheduler.scale = 'Day';
    scheduler.timeHeaders = [
        { groupBy: 'Month', format: 'MMMM yyyy' },
        { groupBy: 'Day', format: 'ddd d' }
    ];
    scheduler.days = 14;
    scheduler.startDate = new window.DayPilot.Date(new Date());

    attachEventHandlers(scheduler, options);

    scheduler.init();
    return scheduler;
}

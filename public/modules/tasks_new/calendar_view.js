/**
 * @fileoverview Inicializa y orquesta la vista de calendario semanal del
 * planificador TasksNew. Conecta los handlers de DayPilot con el editor y el
 * servicio de tareas respetando permisos de lectura/escritura.
 */

import { openCreate, openEdit } from './tasks_editor.js';
import { updateTask, TasksNewValidationError } from './tasks_service.js';

const noop = () => {};

function convertDayPilotDate(value) {
    if (value?.toDate) {
        try {
            return value.toDate();
        } catch (error) {
            console.warn('[TasksNew][Calendar] Failed to convert DayPilot date via toDate()', error);
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

function attachEventHandlers(calendar, options) {
    const {
        onRangeChange = noop,
        onTaskChange = noop,
        convertDayPilotDate: externalConvert = convertDayPilotDate,
        isReadOnly = () => false,
    } = options || {};

    const toDate = (value) => externalConvert(value) || convertDayPilotDate(value);

    const clearSelection = () => {
        if (typeof calendar.clearSelection === 'function') {
            calendar.clearSelection();
        }
    };

    calendar.onTimeRangeSelected = async (args) => {
        clearSelection();
        if (isReadOnly()) {
            showReadOnlyToast();
            return;
        }

        await openCreate({
            start: args?.start,
            end: args?.end,
        });
    };

    calendar.onEventClick = (args) => {
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

        const start = toDate(args?.newStart ?? args?.start);
        const end = toDate(args?.newEnd ?? args?.end);

        try {
            await updateTask(eventId, { start, end });
            await onTaskChange();
        } catch (error) {
            if (error instanceof TasksNewValidationError) {
                if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(error.message, 'error');
                }
            } else {
                console.error('[TasksNew][Calendar] Failed to update event after move/resize.', error);
            }
            await onTaskChange();
        }
    };

    calendar.onEventMoved = handleEventChange;
    calendar.onEventResized = handleEventChange;

    calendar.onVisibleRangeChanged = () => {
        onRangeChange();
    };
}

// Calendar view bootstrap for the new tasks module.
/**
 * Crea la instancia de DayPilot.Calendar y registra handlers compartidos.
 *
 * @param {object} options - Dependencias externas (controles de UI y callbacks).
 * @param {HTMLElement} options.container - Contenedor DOM donde se monta.
 * @param {Function} options.onRangeChange - Notifica cambios de rango visible.
 * @param {Function} options.onTaskChange - Solicita refrescos luego de CRUD.
 * @param {Function} options.onToggleView - Cambia a timeline al click de tab.
 * @returns {DayPilot.Calendar} Instancia configurada lista para usar.
 * Side effects: agrega listeners de selección/click/drag al calendario global.
 */
export function initCalendarView(options = {}) {
    if (!window.DayPilot || typeof window.DayPilot.Calendar !== 'function') {
        console.warn('[TasksNew] DayPilot.Calendar is unavailable.');
        return null;
    }

    const calendar = new window.DayPilot.Calendar('tasksnew-calendar');
    calendar.viewType = 'Week';
    calendar.eventMoveHandling = 'Notify';
    calendar.eventResizeHandling = 'Notify';
    calendar.timeRangeSelectedHandling = 'Enabled';
    calendar.eventClickHandling = 'Enabled';

    attachEventHandlers(calendar, options);

    calendar.init();
    return calendar;
}

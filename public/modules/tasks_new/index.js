/**
 * @fileoverview Punto de entrada del módulo TasksNew. Coordina la inicialización
 * de vistas (calendario y timeline), servicios y preferencias de usuario para
 * el planificador con DayPilot Lite. Expone la API global `window.TasksNew` que
 * recibe dependencias desde `main.js` y administra side-effects como listeners
 * de Firestore, sincronización de rangos visibles y persistencia en
 * `localStorage`.
 */

import { initCalendarView } from './calendar_view.js';
import { initSchedulerView } from './scheduler_view.js';
import { initTasksEditor } from './tasks_editor.js';
import {
    initTasksService,
    listTasks,
    listResources,
    toCalendarEvent,
    toSchedulerEvent,
    TasksNewValidationError,
    debugLog,
} from './tasks_service.js';
import {
    TIMELINE_SCALES,
    VIEW_TYPES,
    filterTasks,
    getTimelineScaleConfig,
    normalizeFilters,
    resolveViewState,
} from './tasks_ui.js';

const DEFAULT_FILTERS = {
    assignedTo: 'all',
    status: 'all',
    priority: 'all',
};

const DEFAULT_PREFERENCES = {
    activeView: VIEW_TYPES.CALENDAR,
    timelineScale: TIMELINE_SCALES.DAYS,
    filters: { ...DEFAULT_FILTERS },
};

const PREFERENCES_STORAGE_KEY = 'tasksNew.preferences';

const moduleState = {
    calendarInstance: null,
    schedulerInstance: null,
    navigatorInstance: null,
    cleanupCallbacks: [],
    isMounted: false,
    dependenciesReady: false,
    currentTasks: [],
    currentResources: [],
    appState: null,
    controls: {},
    containers: {
        calendar: null,
        scheduler: null,
    },
    activeView: DEFAULT_PREFERENCES.activeView,
    filters: { ...DEFAULT_FILTERS },
    timelineScale: DEFAULT_PREFERENCES.timelineScale,
    rangeSyncLock: false,
    navigatorSyncLock: false,
};

/**
 * Contadores en memoria para telemetría ligera del módulo.
 * Se exponen vía `window.TasksNewTelemetry` para que otros
 * componentes (ej. TasksAPI) incrementen métricas compartidas.
 */
const telemetryCounters = {
    viewsOpened: 0,
    aiCreations: 0,
    errorsCaptured: 0,
};

/**
 * Incrementa un contador de telemetría y deja rastro en consola.
 *
 * @param {'viewsOpened'|'aiCreations'|'errorsCaptured'} metric - Nombre del contador a incrementar.
 * @param {object} context - Datos adicionales para depuración.
 * Side effects: muta `telemetryCounters` y escribe en `console.info`.
 */
function incrementTelemetry(metric, context = {}) {
    if (!Object.prototype.hasOwnProperty.call(telemetryCounters, metric)) {
        console.warn('[TasksNew][Telemetry] Métrica desconocida.', { metric, context });
        return;
    }

    telemetryCounters[metric] += 1;
    if (typeof console !== 'undefined') {
        console.info(`[TasksNew][Telemetry] ${metric}: ${telemetryCounters[metric]}`, context);
    }
}

/**
 * Devuelve una copia inmutable del estado actual de los contadores.
 *
 * @returns {{viewsOpened: number, aiCreations: number, errorsCaptured: number}}
 * Side effects: ninguno.
 */
function snapshotTelemetry() {
    return { ...telemetryCounters };
}

/**
 * Expone la API de telemetría en `window.TasksNewTelemetry`.
 *
 * @returns {void}
 * Side effects: adjunta métodos globales y permite que otros módulos registren eventos.
 */
function attachTelemetryApi() {
    if (typeof window === 'undefined') {
        return;
    }

    window.TasksNewTelemetry = Object.assign(window.TasksNewTelemetry || {}, {
        increment: incrementTelemetry,
        snapshot: snapshotTelemetry,
    });
}

attachTelemetryApi();

/**
 * Determina el rol efectivo para enriquecer eventos de telemetría.
 *
 * @returns {string|null} Rol activo (`admin`, `editor`, `lector`) o `null` si no se conoce.
 * Side effects: ninguno.
 */
function getActiveRoleForTelemetry() {
    const previewRole = moduleState.appState?.previewRole;
    if (previewRole) {
        return previewRole;
    }

    if (moduleState.appState?.currentUser?.isSuperAdmin) {
        return 'admin';
    }

    return moduleState.appState?.currentUser?.role || null;
}

function loadPreferencesFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { ...DEFAULT_PREFERENCES };
    }

    try {
        const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (!stored) {
            return { ...DEFAULT_PREFERENCES };
        }

        const parsed = JSON.parse(stored);
        return {
            ...DEFAULT_PREFERENCES,
            ...parsed,
            filters: {
                ...DEFAULT_FILTERS,
                ...(parsed?.filters || {}),
            },
        };
    } catch (error) {
        console.warn('[TasksNew] Failed to parse stored preferences.', error);
        return { ...DEFAULT_PREFERENCES };
    }
}

function persistPreferencesToStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const payload = {
        activeView: moduleState.activeView,
        timelineScale: moduleState.timelineScale,
        filters: { ...moduleState.filters },
    };

    try {
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('[TasksNew] Unable to persist planner preferences.', error);
    }
}

function initializePreferences() {
    const stored = loadPreferencesFromStorage();
    moduleState.activeView = stored.activeView || DEFAULT_PREFERENCES.activeView;
    moduleState.timelineScale = stored.timelineScale || DEFAULT_PREFERENCES.timelineScale;
    moduleState.filters = {
        ...DEFAULT_FILTERS,
        ...(stored.filters || {}),
    };
}

function convertDayPilotDate(daypilotDate) {
    if (!daypilotDate) return null;
    if (typeof daypilotDate.toDate === 'function') {
        try {
            return daypilotDate.toDate();
        } catch (error) {
            console.warn('[TasksNew] Failed to convert DayPilot date via toDate()', error);
        }
    }

    if (daypilotDate.value) {
        const parsed = new Date(daypilotDate.value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    if (daypilotDate instanceof Date) {
        return daypilotDate;
    }

    const fallback = new Date(daypilotDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toDayPilotDate(value) {
    if (typeof window === 'undefined' || !window.DayPilot || typeof window.DayPilot.Date !== 'function') {
        return null;
    }

    if (!value) {
        return null;
    }

    if (value instanceof window.DayPilot.Date) {
        return value;
    }

    try {
        return new window.DayPilot.Date(value);
    } catch (error) {
        console.warn('[TasksNew] Could not convert value to DayPilot.Date.', error);
        return null;
    }
}

function getCalendarVisibleRange() {
    const calendar = moduleState.calendarInstance;
    if (!calendar) {
        return null;
    }

    try {
        if (typeof calendar.visibleStart === 'function' && typeof calendar.visibleEnd === 'function') {
            const start = convertDayPilotDate(calendar.visibleStart());
            const end = convertDayPilotDate(calendar.visibleEnd());
            if (start && end) {
                return { from: start, to: end };
            }
        }
    } catch (error) {
        console.warn('[TasksNew] Unable to determine calendar range via DayPilot API.', error);
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start, to: end };
}

function getSchedulerVisibleRange() {
    const scheduler = moduleState.schedulerInstance;
    if (!scheduler) {
        return null;
    }

    try {
        if (typeof scheduler.visibleStart === 'function' && typeof scheduler.visibleEnd === 'function') {
            const start = convertDayPilotDate(scheduler.visibleStart());
            const end = convertDayPilotDate(scheduler.visibleEnd());
            if (start && end) {
                return { from: start, to: end };
            }
        }
    } catch (error) {
        console.warn('[TasksNew] Unable to determine scheduler range via DayPilot API.', error);
    }

    const fallbackStart = scheduler.startDate ? convertDayPilotDate(scheduler.startDate) : null;
    if (fallbackStart) {
        let fallbackEnd = null;

        if (typeof scheduler.visibleEnd === 'function') {
            fallbackEnd = convertDayPilotDate(scheduler.visibleEnd());
        }

        if (!fallbackEnd) {
            if (typeof scheduler.days === 'number' && Number.isFinite(scheduler.days)) {
                fallbackEnd = new Date(fallbackStart);
                fallbackEnd.setDate(fallbackEnd.getDate() + Math.max(1, scheduler.days));
            } else if (scheduler.scale === 'Week') {
                fallbackEnd = new Date(fallbackStart);
                fallbackEnd.setDate(fallbackEnd.getDate() + 7);
            } else if (scheduler.scale === 'CellDuration') {
                const durationMinutes = scheduler.cellDuration || 60;
                const cellCount = Array.isArray(scheduler.timeline) ? scheduler.timeline.length : 24;
                fallbackEnd = new Date(fallbackStart.getTime() + durationMinutes * cellCount * 60000);
            } else {
                fallbackEnd = new Date(fallbackStart);
                fallbackEnd.setDate(fallbackEnd.getDate() + 7);
            }
        }

        return { from: fallbackStart, to: fallbackEnd };
    }

    return null;
}

function applyCalendarEvents(tasks) {
    if (!moduleState.calendarInstance) return;

    const events = tasks
        .map(toCalendarEvent)
        .filter(Boolean);

    moduleState.calendarInstance.events.list = events;
    if (typeof moduleState.calendarInstance.update === 'function') {
        moduleState.calendarInstance.update();
    }
}

function updateAssignedFilterOptions(resources = moduleState.currentResources) {
    const assignedSelect = moduleState.controls?.assignedSelect;
    if (!assignedSelect) {
        return;
    }

    const normalizedResources = Array.isArray(resources) ? resources : [];
    const uniqueResources = normalizedResources.filter((resource) => resource && resource.id);

    const options = [
        { value: 'all', label: 'Todos' },
        ...uniqueResources.map((resource) => ({
            value: resource.id,
            label: resource.name || resource.id,
        })),
    ];

    const currentFilterValue = moduleState.filters?.assignedTo || 'all';

    if (options.length === 1 && currentFilterValue !== 'all') {
        options.push({
            value: currentFilterValue,
            label: 'Seleccionado (no disponible)',
        });
    }

    assignedSelect.innerHTML = options
        .map((option) => `<option value="${option.value}">${option.label}</option>`)
        .join('');

    const hasCurrentValue = options.some((option) => String(option.value) === String(currentFilterValue));
    const valueToSet = hasCurrentValue ? currentFilterValue : 'all';

    assignedSelect.value = valueToSet;

    if (valueToSet !== currentFilterValue) {
        moduleState.filters.assignedTo = valueToSet;
        persistPreferencesToStorage();
    }
}

function applySchedulerData(tasks, resources) {
    if (!moduleState.schedulerInstance) return;

    moduleState.schedulerInstance.events.list = tasks
        .map(toSchedulerEvent)
        .filter(Boolean);

    if (Array.isArray(resources)) {
        moduleState.schedulerInstance.resources = resources.map(resource => ({
            id: resource.id,
            name: resource.name,
            text: resource.name
        }));
    }

    moduleState.currentResources = Array.isArray(resources) ? resources : [];

    if (typeof moduleState.schedulerInstance.update === 'function') {
        moduleState.schedulerInstance.update();
    }

    updateAssignedFilterOptions(moduleState.currentResources);
}

function getEffectiveRange() {
    return getCalendarVisibleRange()
        || getSchedulerVisibleRange()
        || (() => {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            return { from: start, to: end };
        })();
}

function getActiveFilters() {
    return normalizeFilters(moduleState.filters || DEFAULT_FILTERS);
}

function applyTimelineScale(scale, { skipPersist = false } = {}) {
    const scheduler = moduleState.schedulerInstance;
    const config = getTimelineScaleConfig(scale);
    moduleState.timelineScale = Object.values(TIMELINE_SCALES).includes(scale)
        ? scale
        : TIMELINE_SCALES.DAYS;

    debugLog('Aplicando escala del timeline.', {
        requestedScale: scale,
        effectiveScale: moduleState.timelineScale,
    });

    if (!scheduler) {
        if (!skipPersist) {
            persistPreferencesToStorage();
        }
        return;
    }

    scheduler.scale = config.scale;
    if (config.cellDuration) {
        scheduler.cellDuration = config.cellDuration;
    } else if ('cellDuration' in scheduler) {
        delete scheduler.cellDuration;
    }

    scheduler.timeHeaders = config.timeHeaders;

    if (typeof scheduler.update === 'function') {
        scheduler.update();
    }

    if (!skipPersist) {
        persistPreferencesToStorage();
    }
}

function syncNavigatorSelection(date) {
    if (!moduleState.navigatorInstance || moduleState.navigatorSyncLock) {
        return;
    }

    const targetDate = date || new Date();
    const daypilotDate = toDayPilotDate(targetDate);
    if (!daypilotDate) {
        return;
    }

    moduleState.navigatorSyncLock = true;
    try {
        if (typeof moduleState.navigatorInstance.select === 'function') {
            moduleState.navigatorInstance.select(daypilotDate);
        }
        if (typeof moduleState.navigatorInstance.scrollTo === 'function') {
            moduleState.navigatorInstance.scrollTo(daypilotDate, 'middle');
        }
    } catch (error) {
        console.warn('[TasksNew] Unable to sync navigator selection.', error);
    } finally {
        moduleState.navigatorSyncLock = false;
    }
}

function alignCalendarStart(date) {
    const calendar = moduleState.calendarInstance;
    if (!calendar) {
        return;
    }

    const daypilotDate = toDayPilotDate(date);
    if (!daypilotDate) {
        return;
    }

    calendar.startDate = daypilotDate;
    if (typeof calendar.update === 'function') {
        calendar.update();
    }
}

function alignSchedulerStart(date) {
    const scheduler = moduleState.schedulerInstance;
    if (!scheduler) {
        return;
    }

    const daypilotDate = toDayPilotDate(date);
    if (!daypilotDate) {
        return;
    }

    scheduler.startDate = daypilotDate;
    if (typeof scheduler.update === 'function') {
        scheduler.update();
    }
}

function syncRangeFromNavigator(day) {
    if (!day) {
        return;
    }

    moduleState.rangeSyncLock = true;
    try {
        alignCalendarStart(day);
        alignSchedulerStart(day);
    } finally {
        moduleState.rangeSyncLock = false;
    }
}

function handleRangeChange(source) {
    if (!moduleState.isMounted) {
        return;
    }

    if (moduleState.rangeSyncLock) {
        return;
    }

    const range = source === 'calendar'
        ? getCalendarVisibleRange()
        : getSchedulerVisibleRange();

    if (!range) {
        refreshData();
        return;
    }

    moduleState.rangeSyncLock = true;
    try {
        syncNavigatorSelection(range.from);
        if (source === 'calendar') {
            alignSchedulerStart(range.from);
        } else if (source === 'scheduler') {
            alignCalendarStart(range.from);
        }
    } finally {
        moduleState.rangeSyncLock = false;
    }

    refreshData();
}

function setActiveView(view, { skipPersist = false, skipSync = false } = {}) {
    const state = resolveViewState(view, moduleState.activeView);
    moduleState.activeView = state.activeView;

    debugLog('Actualizando vista activa.', {
        requestedView: view,
        activeView: state.activeView,
    });

    const calendarContainer = moduleState.containers.calendar;
    const schedulerContainer = moduleState.containers.scheduler;
    if (calendarContainer && schedulerContainer) {
        calendarContainer.style.display = state.calendarDisplay;
        schedulerContainer.style.display = state.schedulerDisplay;
    }

    const calendarTab = moduleState.controls?.calendarTab;
    const timelineTab = moduleState.controls?.timelineTab;

    if (calendarTab && timelineTab) {
        const toggleClasses = (tab, isActive) => {
            tab.classList.toggle('bg-blue-600', isActive);
            tab.classList.toggle('text-white', isActive);
            tab.classList.toggle('border-blue-600', isActive);
            tab.classList.toggle('bg-white', !isActive);
            tab.classList.toggle('text-slate-600', !isActive);
            tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        };

        toggleClasses(calendarTab, state.activeView === VIEW_TYPES.CALENDAR);
        toggleClasses(timelineTab, state.activeView === VIEW_TYPES.TIMELINE);
    }

    if (!skipPersist) {
        persistPreferencesToStorage();
    }

    if (!skipSync) {
        const activeRange = state.activeView === VIEW_TYPES.CALENDAR
            ? getCalendarVisibleRange()
            : getSchedulerVisibleRange() || getCalendarVisibleRange();
        syncNavigatorSelection(activeRange?.from || new Date());
    }
}

function setupControls(containerEl) {
    const controlsContainer = containerEl.querySelector('#tasksnew-controls');
    if (!controlsContainer) {
        console.warn('[TasksNew] Controls container not found.');
        return;
    }

    controlsContainer.innerHTML = `
        <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-3">
                <div class="inline-flex rounded-md shadow-sm" role="group">
                    <button type="button" data-tasksnew-tab="calendar" class="px-4 py-2 text-sm font-semibold border border-blue-600 rounded-l-md bg-blue-600 text-white">Calendario</button>
                    <button type="button" data-tasksnew-tab="timeline" class="px-4 py-2 text-sm font-semibold border border-blue-600 rounded-r-md bg-white text-slate-600">Timeline</button>
                </div>
                <label class="flex items-center gap-2 text-sm font-medium text-slate-600">
                    Escala
                    <select data-tasksnew-scale class="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
                        <option value="${TIMELINE_SCALES.HOURS}">Horas</option>
                        <option value="${TIMELINE_SCALES.DAYS}">Días</option>
                        <option value="${TIMELINE_SCALES.WEEKS}">Semanas</option>
                    </select>
                </label>
            </div>
            <div class="flex flex-wrap items-center gap-4">
                <label class="flex flex-col text-sm font-medium text-slate-600 gap-1">
                    <span>Asignado a</span>
                    <select data-tasksnew-filter="assignedTo" class="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
                        <option value="all">Todos</option>
                    </select>
                </label>
                <label class="flex flex-col text-sm font-medium text-slate-600 gap-1">
                    <span>Estado</span>
                    <select data-tasksnew-filter="status" class="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
                        <option value="all">Todos</option>
                        <option value="todo">Por hacer</option>
                        <option value="inprogress">En progreso</option>
                        <option value="done">Completado</option>
                    </select>
                </label>
                <label class="flex flex-col text-sm font-medium text-slate-600 gap-1">
                    <span>Prioridad</span>
                    <select data-tasksnew-filter="priority" class="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white">
                        <option value="all">Todas</option>
                        <option value="low">Baja</option>
                        <option value="med">Media</option>
                        <option value="high">Alta</option>
                    </select>
                </label>
            </div>
            <div>
                <span class="block text-sm font-medium text-slate-600 mb-2">Navegación</span>
                <div id="tasksnew-navigator" class="border border-slate-200 rounded-lg bg-slate-50 p-2 min-w-[220px]"></div>
            </div>
        </div>
    `;

    const calendarTab = controlsContainer.querySelector('[data-tasksnew-tab="calendar"]');
    const timelineTab = controlsContainer.querySelector('[data-tasksnew-tab="timeline"]');
    const scaleSelect = controlsContainer.querySelector('[data-tasksnew-scale]');
    const assignedSelect = controlsContainer.querySelector('[data-tasksnew-filter="assignedTo"]');
    const statusSelect = controlsContainer.querySelector('[data-tasksnew-filter="status"]');
    const prioritySelect = controlsContainer.querySelector('[data-tasksnew-filter="priority"]');
    const navigatorContainer = controlsContainer.querySelector('#tasksnew-navigator');

    moduleState.controls = {
        controlsContainer,
        calendarTab,
        timelineTab,
        scaleSelect,
        assignedSelect,
        statusSelect,
        prioritySelect,
        navigatorContainer,
    };

    if (scaleSelect) {
        scaleSelect.value = moduleState.timelineScale || TIMELINE_SCALES.DAYS;
    }

    if (statusSelect) {
        statusSelect.value = moduleState.filters?.status || 'all';
    }

    if (prioritySelect) {
        prioritySelect.value = moduleState.filters?.priority || 'all';
    }

    updateAssignedFilterOptions();

    const handleTabClick = (event) => {
        event.preventDefault();
        const { tasksnewTab } = event.currentTarget.dataset;
        setActiveView(tasksnewTab || 'calendar');
    };

    const handleFilterChange = (event) => {
        const { tasksnewFilter } = event.target.dataset;
        if (!tasksnewFilter) {
            return;
        }

        const value = event.target.value || 'all';
        moduleState.filters = {
            ...moduleState.filters,
            [tasksnewFilter]: value,
        };

        persistPreferencesToStorage();
        refreshData();
    };

    const handleScaleChange = (event) => {
        const value = event.target.value || TIMELINE_SCALES.DAYS;
        applyTimelineScale(value);
    };

    calendarTab?.addEventListener('click', handleTabClick);
    timelineTab?.addEventListener('click', handleTabClick);
    assignedSelect?.addEventListener('change', handleFilterChange);
    statusSelect?.addEventListener('change', handleFilterChange);
    prioritySelect?.addEventListener('change', handleFilterChange);
    scaleSelect?.addEventListener('change', handleScaleChange);

    moduleState.cleanupCallbacks.push(() => {
        calendarTab?.removeEventListener('click', handleTabClick);
        timelineTab?.removeEventListener('click', handleTabClick);
        assignedSelect?.removeEventListener('change', handleFilterChange);
        statusSelect?.removeEventListener('change', handleFilterChange);
        prioritySelect?.removeEventListener('change', handleFilterChange);
        scaleSelect?.removeEventListener('change', handleScaleChange);
    });

    setActiveView(moduleState.activeView, { skipPersist: true, skipSync: true });
}

function initNavigator() {
    if (!moduleState.controls?.navigatorContainer) {
        return;
    }

    if (!window.DayPilot || typeof window.DayPilot.Navigator !== 'function') {
        console.warn('[TasksNew] DayPilot.Navigator is unavailable.');
        return;
    }

    moduleState.navigatorInstance = new window.DayPilot.Navigator('tasksnew-navigator');
    moduleState.navigatorInstance.showMonths = 1;
    moduleState.navigatorInstance.skipMonths = 0;
    moduleState.navigatorInstance.selectMode = 'Week';
    moduleState.navigatorInstance.onTimeRangeSelected = (args) => {
        if (moduleState.navigatorSyncLock) {
            return;
        }

        const day = args?.day || args?.start || args?.date;
        syncRangeFromNavigator(day);
        refreshData();
    };

    moduleState.navigatorInstance.init();

    moduleState.cleanupCallbacks.push(() => {
        if (moduleState.navigatorInstance) {
            if (typeof moduleState.navigatorInstance.dispose === 'function') {
                try {
                    moduleState.navigatorInstance.dispose();
                } catch (error) {
                    console.warn('[TasksNew] Failed to dispose navigator instance.', error);
                }
            }
            moduleState.navigatorInstance = null;
        }
    });

    const initialRange = getCalendarVisibleRange() || getSchedulerVisibleRange();
    syncNavigatorSelection(initialRange?.from || new Date());
}

function isReadOnlyRole() {
    if (!moduleState.dependenciesReady) {
        return true;
    }

    const previewRole = moduleState.appState?.previewRole;
    if (previewRole) {
        return previewRole === 'lector';
    }

    const role = moduleState.appState?.currentUser?.role;
    if (!role) {
        return true;
    }

    return role === 'lector';
}

async function refreshData() {
    if (!moduleState.dependenciesReady) {
        console.warn('[TasksNew] Tried to refresh data before dependencies were ready.');
        return;
    }

    const range = getEffectiveRange();
    const filters = getActiveFilters();
    debugLog('Refrescando datos del planificador.', {
        range,
        filters,
    });
    try {
        const queryParams = {
            ...(range || {}),
            filters,
        };
        const tasks = await listTasks(queryParams);
        if (!moduleState.isMounted) {
            return;
        }
        const filteredTasks = filterTasks(tasks, filters);
        moduleState.currentTasks = filteredTasks;
        applyCalendarEvents(filteredTasks);

        try {
            const resources = await listResources();
            if (moduleState.isMounted) {
                applySchedulerData(filteredTasks, resources);
            }
        } catch (error) {
            if (error instanceof TasksNewValidationError) {
                throw error;
            }
            console.warn('[TasksNew] Could not load scheduler resources.', error);
            applySchedulerData(filteredTasks, moduleState.currentResources);
        }
    } catch (error) {
        if (error instanceof TasksNewValidationError) {
            const message = error.message || 'No se pudieron cargar las tareas (validación).';
            if (typeof window !== 'undefined' && window.showToast) {
                window.showToast(message, 'error');
            } else {
                console.warn('[TasksNew] Validation error while loading tasks:', error.message);
            }
        } else {
            console.error('[TasksNew] Failed to load tasks for the new module.', error);
        }
    }
}

function applyInteractionGuards() {
    const readOnly = isReadOnlyRole();

    if (moduleState.calendarInstance) {
        moduleState.calendarInstance.timeRangeSelectedHandling = readOnly ? 'Disabled' : 'Enabled';
        moduleState.calendarInstance.eventMoveHandling = readOnly ? 'Disabled' : 'Notify';
        moduleState.calendarInstance.eventResizeHandling = readOnly ? 'Disabled' : 'Notify';
        moduleState.calendarInstance.eventClickHandling = readOnly ? 'Disabled' : 'Enabled';
        if (typeof moduleState.calendarInstance.update === 'function') {
            moduleState.calendarInstance.update();
        }
    }

    if (moduleState.schedulerInstance) {
        moduleState.schedulerInstance.timeRangeSelectedHandling = readOnly ? 'Disabled' : 'Enabled';
        moduleState.schedulerInstance.eventMoveHandling = readOnly ? 'Disabled' : 'Notify';
        moduleState.schedulerInstance.eventResizeHandling = readOnly ? 'Disabled' : 'Notify';
        moduleState.schedulerInstance.eventClickHandling = readOnly ? 'Disabled' : 'Enabled';
        if (typeof moduleState.schedulerInstance.update === 'function') {
            moduleState.schedulerInstance.update();
        }
    }
}

function setupEditorBridge() {
    initTasksEditor({
        getIsReadOnly: () => isReadOnlyRole(),
        refreshData: () => refreshData(),
        getTaskById: (taskId) => moduleState.currentTasks.find(task => task.id === taskId) || null,
        getResources: () => moduleState.currentResources.slice(),
        fetchResources: async () => {
            try {
                const resources = await listResources();
                if (moduleState.isMounted) {
                    moduleState.currentResources = Array.isArray(resources) ? resources : [];
                }
                return resources;
            } catch (error) {
                console.warn('[TasksNew] Failed to fetch resources from editor bridge.', error);
                throw error;
            }
        },
        convertDayPilotDate,
    });
}

function renderScaffold(containerEl) {
    containerEl.innerHTML = `
        <section class="space-y-6">
            <div id="tasksnew-controls" class="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"></div>
            <div id="tasksnew-calendar" class="bg-white border border-slate-200 rounded-lg min-h-[480px] shadow-sm"></div>
            <div id="tasksnew-scheduler" class="bg-white border border-slate-200 rounded-lg min-h-[480px] shadow-sm"></div>
        </section>
    `;
}

function performInit(containerEl) {
    if (!containerEl) {
        console.warn('[TasksNew] Container element missing.');
        return () => {};
    }

    moduleState.cleanupCallbacks.forEach((cb) => cb());
    moduleState.cleanupCallbacks = [];
    moduleState.rangeSyncLock = false;
    moduleState.navigatorSyncLock = false;
    moduleState.navigatorInstance = null;
    moduleState.controls = {};
    moduleState.containers = {
        calendar: null,
        scheduler: null,
    };

    initializePreferences();

    renderScaffold(containerEl);

    moduleState.containers = {
        calendar: containerEl.querySelector('#tasksnew-calendar'),
        scheduler: containerEl.querySelector('#tasksnew-scheduler'),
    };

    setupControls(containerEl);

    moduleState.calendarInstance = initCalendarView({
        onRangeChange: () => handleRangeChange('calendar'),
        onTaskChange: () => refreshData(),
        convertDayPilotDate,
        isReadOnly: () => isReadOnlyRole(),
    });
    moduleState.schedulerInstance = initSchedulerView({
        onRangeChange: () => handleRangeChange('scheduler'),
        onTaskChange: () => refreshData(),
        convertDayPilotDate,
        isReadOnly: () => isReadOnlyRole(),
    });

    applyTimelineScale(moduleState.timelineScale, { skipPersist: true });

    initNavigator();

    setActiveView(moduleState.activeView, { skipPersist: true });
    moduleState.isMounted = true;

    incrementTelemetry('viewsOpened', {
        role: getActiveRoleForTelemetry() || 'unknown',
        at: new Date().toISOString(),
    });

    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }

    setupEditorBridge();
    const handleAITasksUpdated = () => {
        if (moduleState.isMounted) {
            refreshData();
        }
    };
    document.addEventListener('ai-tasks-updated', handleAITasksUpdated);
    moduleState.cleanupCallbacks.push(() => {
        document.removeEventListener('ai-tasks-updated', handleAITasksUpdated);
    });
    applyInteractionGuards();
    refreshData();

    return () => {
        moduleState.cleanupCallbacks.forEach((cb) => cb());
        moduleState.cleanupCallbacks = [];
        moduleState.calendarInstance = null;
        moduleState.schedulerInstance = null;
        moduleState.navigatorInstance = null;
        moduleState.currentTasks = [];
        moduleState.currentResources = [];
        moduleState.controls = {};
        moduleState.containers = {
            calendar: null,
            scheduler: null,
        };
        moduleState.isMounted = false;
        moduleState.rangeSyncLock = false;
        moduleState.navigatorSyncLock = false;
    };
}

/**
 * Inicializa el módulo y monta el contenedor principal.
 *
 * @param {HTMLElement} containerEl - Elemento destino donde se renderiza la UI.
 * @returns {Function} Función de limpieza que desmonta listeners y referencias.
 * Side effects: registra listeners DayPilot, lee preferencias y sincroniza Firestore.
 */
function init(containerEl) {
    debugLog('Inicializando módulo TasksNew.');
    try {
        const cleanup = performInit(containerEl);
        debugLog('Inicialización exitosa.', { activeView: moduleState.activeView });
        return cleanup;
    } catch (error) {
        const errorCode = `TN-${Date.now().toString(36).toUpperCase()}`;
        console.error(`[TasksNew] Error crítico al iniciar (${errorCode}).`, error);
        incrementTelemetry('errorsCaptured', {
            phase: 'init',
            code: errorCode,
            message: error?.message || null,
        });
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast(
                `No pudimos iniciar el planificador. Código: ${errorCode}. Probá recargar la página o contactá al equipo de soporte.`,
                'error'
            );
        }
        return () => {};
    }
}

/**
 * Recibe dependencias externas (Firestore, appState) después de la carga global.
 *
 * @param {{db?: import('firebase/firestore').Firestore, appState?: object}} dependencies
 *        Conexiones compartidas con el shell de la app.
 * Side effects: inicializa servicios, habilita el editor y dispara refrescos de datos.
 */
function provideDependencies(dependencies = {}) {
    debugLog('Recibiendo dependencias externas.', {
        hasDb: Boolean(dependencies.db),
        hasAppState: Boolean(dependencies.appState),
    });
    initTasksService(dependencies);
    moduleState.dependenciesReady = true;
    if (dependencies.appState) {
        moduleState.appState = dependencies.appState;
    }
    setupEditorBridge();
    applyInteractionGuards();
    if (moduleState.isMounted) {
        refreshData();
    }
}

if (typeof window !== 'undefined') {
    const api = {
        init,
        provideDependencies,
    };

    window.TasksNew = Object.assign(window.TasksNew || {}, api);
}

const TasksNew = {
    init,
    provideDependencies,
};

export default TasksNew;

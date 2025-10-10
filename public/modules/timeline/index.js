import { appState, dom } from '../../main.js';
import { getDocs, collection, query, orderBy, where, doc, updateDoc as firebaseUpdateDoc, addDoc, deleteDoc, Timestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { augmentTaskWithSchedule, augmentTasksWithSchedule, formatPlannedRange, formatSignedPoints, formatTaskScheduleTooltip, getTaskStateChipHTML, getTaskStateDisplay, TASK_STATE, TASK_STATE_CONFIG, TASK_STATE_SEQUENCE } from '../../utils/task-status.js';

// Module-level variables
let db;
let unsubscribeTasks = null;
let unsubscribeKeyDates = null;
let openTaskFormModalRef = null;
let showConfirmationModalRef = null;
let updateDocFn = firebaseUpdateDoc;
let modalCloseObserver = null;
let currentLanedTasks = [];
let taskListHandlersBound = false;
let gridHandlersBound = false;
let containerHoverHandlersBound = false;
let isSyncingScroll = false;
let scrollHandlersBound = false;
const timelineState = {
    zoomLevel: 'year', // 'year', 'month', 'week'
    visibleDate: new Date(),
    summaryYear: new Date().getFullYear(),
    statusFilter: 'all',
    assigneeFilter: 'all',
    keyDates: [],
    currentRange: null,
    usingSampleData: false,
    lastFetchedTasks: []
};
const TASK_BAR_HEIGHT = 22;
const TASK_BAR_GAP = 8;
const MIN_BAR_DURATION_DAYS = 3;
const YEAR_DAY_COLUMN_MIN_WIDTH = 12;
const MONTH_DAY_COLUMN_MIN_WIDTH = 42;
const WEEK_DAY_COLUMN_MIN_WIDTH = 140;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abr", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_ABBREVIATIONS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const SUMMARY_STATUS_FILTERS = [
    { value: 'all', label: 'Todas' },
    { value: TASK_STATE.COMPLETED, label: 'Completadas' },
    { value: TASK_STATE.ON_TIME, label: 'A tiempo' },
    { value: TASK_STATE.AT_RISK, label: 'En riesgo' },
    { value: TASK_STATE.DELAYED, label: 'Atrasadas' }
];

function attachTaskModalCloseObserver() {
    if (!dom?.modalContainer) return;
    if (modalCloseObserver) {
        modalCloseObserver.disconnect();
        modalCloseObserver = null;
    }
    modalCloseObserver = new MutationObserver(() => {
        if (!dom.modalContainer.querySelector('#task-form-modal')) {
            if (modalCloseObserver) {
                modalCloseObserver.disconnect();
                modalCloseObserver = null;
            }
            renderTimeline();
        }
    });
    modalCloseObserver.observe(dom.modalContainer, { childList: true });
}

function prefillTaskModalDates(startDate, dueDate) {
    if (!startDate && !dueDate) return;
    const applyPrefill = () => {
        const modal = document.getElementById('task-form-modal');
        if (!modal) return;
        if (startDate) {
            const startInput = modal.querySelector('#task-startdate');
            if (startInput) startInput.value = startDate;
        }
        if (dueDate) {
            const dueInput = modal.querySelector('#task-duedate');
            if (dueInput) dueInput.value = dueDate;
            const endInput = modal.querySelector('#task-enddate');
            if (endInput) endInput.value = dueDate;
        }
    };
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(applyPrefill);
    } else {
        setTimeout(applyPrefill, 0);
    }
}

async function openTaskModal(task = null, options = {}) {
    const { status = 'todo', assigneeUid = null, startDate = null, dueDate = null } = options;
    if (typeof openTaskFormModalRef !== 'function') return;
    await openTaskFormModalRef(task, status, assigneeUid, startDate || null);
    prefillTaskModalDates(startDate, dueDate);
    attachTaskModalCloseObserver();
}

function findTaskById(taskId) {
    if (!taskId) return null;
    const lanedMatch = currentLanedTasks.find(task => task?.id === taskId);
    if (lanedMatch) return lanedMatch;
    if (Array.isArray(timelineState.lastFetchedTasks)) {
        return timelineState.lastFetchedTasks.find(task => task?.id === taskId) || null;
    }
    return null;
}

async function openTaskForEditing(taskId) {
    const task = findTaskById(taskId);
    if (!task) return;
    if (task.isSample) {
        window.showToast('Los datos de ejemplo no se pueden editar.', 'info');
        return;
    }
    const normalizedTask = normalizeTaskForModal(task);
    await openTaskModal(normalizedTask, {
        status: normalizedTask.status || 'todo',
        assigneeUid: normalizedTask.assigneeUid || null
    });
}

function confirmAndDeleteTask(task) {
    if (!task) return;
    if (task.isSample) {
        window.showToast('Los datos de ejemplo no se pueden eliminar.', 'info');
        return;
    }
    const docId = task.docId || task.id;
    if (!db || !docId) return;
    const safeTitle = escapeHTML(task.title || 'Tarea sin título');
    const executeDeletion = async () => {
        const toastId = window.showToast('Eliminando tarea...', 'loading', { duration: 0 });
        try {
            await deleteDoc(doc(db, 'tareas', docId));
            window.showToast('Tarea eliminada.', 'success', { toastId });
            renderTimeline();
        } catch (error) {
            console.error('Error deleting task from planning:', error);
            window.showToast('No se pudo eliminar la tarea.', 'error', { toastId });
        }
    };
    if (typeof showConfirmationModalRef === 'function') {
        showConfirmationModalRef(
            'Eliminar tarea',
            `¿Querés eliminar "${safeTitle}" del planning?`,
            () => { void executeDeletion(); }
        );
    } else if (window.confirm(`¿Querés eliminar "${task.title || 'Tarea sin título'}" del planning?`)) {
        void executeDeletion();
    }
}

function handleTaskListClick(event) {
    const row = event.target.closest('.task-table-row');
    if (!row) return;
    if (event.target.closest('.task-progress-controls')) return;
    if (event.target.closest('.task-progress-slider')) return;
    const taskId = row.dataset.taskId;
    if (!taskId) return;
    void openTaskForEditing(taskId);
}

function handleTaskListContextMenu(event) {
    const row = event.target.closest('.task-table-row');
    if (!row) return;
    const taskId = row.dataset.taskId;
    if (!taskId) return;
    event.preventDefault();
    const task = findTaskById(taskId);
    confirmAndDeleteTask(task);
}

function handleTaskBarClick(event) {
    const bar = event.target.closest('.task-bar');
    if (!bar) return;
    if (bar.dataset.dragging === 'true' || bar.dataset.resizing === 'true') {
        return;
    }
    const taskId = bar.dataset.taskId;
    if (!taskId) return;
    void openTaskForEditing(taskId);
}

function handleTaskBarContextMenu(event) {
    const bar = event.target.closest('.task-bar');
    if (!bar) return;
    const taskId = bar.dataset.taskId;
    if (!taskId) return;
    event.preventDefault();
    const task = findTaskById(taskId);
    confirmAndDeleteTask(task);
}

function handleTaskHoverEnter(event) {
    const target = event.target.closest('[data-task-id]');
    if (!target) return;
    const taskId = target.dataset.taskId;
    if (!taskId) return;
    document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => el.classList.add('highlight'));
}

function handleTaskHoverLeave(event) {
    const target = event.target.closest('[data-task-id]');
    if (!target) return;
    const taskId = target.dataset.taskId;
    if (!taskId) return;
    document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => el.classList.remove('highlight'));
}

function handleTimelineGridDoubleClick(event) {
    const gridContent = event.currentTarget;
    if (!gridContent) return;
    if (event.target.closest('.task-bar')) return;
    const context = { zoomLevel: timelineState.zoomLevel, visibleDate: timelineState.visibleDate };
    const daysInPeriod = getDaysInPeriod(context);
    if (daysInPeriod <= 0) return;
    const rect = gridContent.getBoundingClientRect();
    const totalWidth = gridContent.offsetWidth || rect.width;
    if (!totalWidth) return;
    const rawX = event.clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rawX, totalWidth));
    let dayOffset = pixelsToDays(clampedX, totalWidth, daysInPeriod);
    dayOffset = Math.max(0, Math.min(dayOffset, daysInPeriod - 1));
    const activeRange = timelineState.currentRange || getPeriodRange(timelineState.zoomLevel, timelineState.visibleDate);
    const rangeStart = parseDateOnly(activeRange?.startDate);
    const rangeEnd = parseDateOnly(activeRange?.endDate);
    if (!rangeStart) return;
    const startDateObj = addDays(rangeStart, dayOffset) || rangeStart;
    let dueDateObj = addDays(startDateObj, Math.max(MIN_BAR_DURATION_DAYS - 1, 0)) || startDateObj;
    if (rangeEnd && dueDateObj > rangeEnd) {
        dueDateObj = new Date(rangeEnd.getTime());
    }
    const startDate = startDateObj.toISOString().split('T')[0];
    const dueDate = dueDateObj.toISOString().split('T')[0];
    void openTaskModal(null, { status: 'todo', startDate, dueDate });
}

function onTaskListScroll() {
    const taskList = document.querySelector('.timeline-task-list');
    const taskGrid = document.querySelector('.timeline-grid');
    if (!taskList || !taskGrid) return;
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    taskGrid.scrollTop = taskList.scrollTop;
    setTimeout(() => { isSyncingScroll = false; }, 50);
}

function onTaskGridScroll() {
    const taskList = document.querySelector('.timeline-task-list');
    const taskGrid = document.querySelector('.timeline-grid');
    if (!taskList || !taskGrid) return;
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    taskList.scrollTop = taskGrid.scrollTop;
    setTimeout(() => { isSyncingScroll = false; }, 50);
}

function handleAssigneeFilterChange(event) {
    if (!event?.target) return;
    timelineState.assigneeFilter = event.target.value;
    renderTimeline();
}

function attachAssigneeFilterListener() {
    const filterSelect = document.getElementById('timeline-assignee-filter');
    if (!filterSelect) return;
    filterSelect.value = timelineState.assigneeFilter;
    filterSelect.removeEventListener('change', handleAssigneeFilterChange);
    filterSelect.addEventListener('change', handleAssigneeFilterChange);
}

function escapeHTML(value) {
    if (typeof value !== 'string') {
        return value ?? '';
    }
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeToDateOnly(date) {
    const normalized = parseDateValue(date);
    if (!normalized) return null;
    normalized.setHours(0, 0, 0, 0);
    return normalized;
}

function isTaskOverdue(task, referenceDate = new Date()) {
    if (!task) return false;
    const dueDate = parseDateOnly(task.dueDate);
    if (!dueDate) return false;
    const today = normalizeToDateOnly(referenceDate);
    dueDate.setHours(0, 0, 0, 0);
    if (!today) return false;
    if (task.status === 'done') {
        return false;
    }
    return dueDate.getTime() < today.getTime();
}

function getTaskDelayDays(task, referenceDate = new Date()) {
    if (!isTaskOverdue(task, referenceDate)) return 0;
    const dueDate = parseDateOnly(task.dueDate);
    const today = normalizeToDateOnly(referenceDate);
    if (!dueDate || !today) return 0;
    const diff = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / MILLISECONDS_IN_DAY));
    return diff;
}

function getTaskProgressValue(task) {
    let progressValue = Number.parseInt(task?.progress, 10);
    if (Number.isNaN(progressValue)) {
        progressValue = task?.status === 'done' ? 100 : 0;
    }
    return Math.min(100, Math.max(0, progressValue));
}

function getTimelinePeriodLabel(context) {
    if (!context) return 'período';
    const { zoomLevel, visibleDate } = context;
    if (zoomLevel === 'week') {
        return `semana del ${getWeekRangeString(visibleDate)}`;
    }
    if (zoomLevel === 'month') {
        return `${MONTH_NAMES[visibleDate.getMonth()]} ${visibleDate.getFullYear()}`;
    }
    return `año ${visibleDate.getFullYear()}`;
}

function taskOverlapsRange(task, startDate, endDate) {
    const taskStart = parseDateOnly(task?.startDate);
    if (!taskStart) return false;
    const taskEnd = getSafeDueDate(task?.startDate, task?.dueDate);
    if (!taskEnd) return false;

    const periodStart = parseDateOnly(startDate);
    const periodEnd = parseDateOnly(endDate);
    if (!periodStart || !periodEnd) return false;

    return taskEnd >= periodStart && taskStart <= periodEnd;
}

function getPeriodRange(zoomLevel, date) {
    const reference = new Date(date);
    const year = reference.getFullYear();
    switch (zoomLevel) {
        case 'month': {
            const month = reference.getMonth();
            return {
                startDate: new Date(year, month, 1).toISOString().split('T')[0],
                endDate: new Date(year, month + 1, 0).toISOString().split('T')[0]
            };
        }
        case 'week': {
            const day = reference.getDay();
            const diff = reference.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(reference.setDate(diff));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return {
                startDate: monday.toISOString().split('T')[0],
                endDate: sunday.toISOString().split('T')[0]
            };
        }
        case 'year':
        default:
            return {
                startDate: `${year}-01-01`,
                endDate: `${year}-12-31`
            };
    }
}

function getDaysInPeriod(context) {
    const { zoomLevel, visibleDate } = context;
    const year = visibleDate.getFullYear();
    if (zoomLevel === 'year') {
        return isLeapYear(year) ? 366 : 365;
    }
    if (zoomLevel === 'month') {
        return new Date(year, visibleDate.getMonth() + 1, 0).getDate();
    }
    return 7;
}

function renderInsightsSkeleton() {
    return Array.from({ length: 4 }).map(() => `
        <div class="timeline-insight-card animate-pulse">
            <div class="h-4 w-24 rounded-full bg-slate-200/80 dark:bg-slate-700/60"></div>
            <div class="mt-4 h-8 w-32 rounded-full bg-slate-200/80 dark:bg-slate-700/60"></div>
            <div class="mt-3 h-3 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/60"></div>
        </div>
    `).join('');
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function coerceToDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (value instanceof Timestamp) {
        const converted = value.toDate();
        return Number.isNaN(converted?.getTime?.()) ? null : new Date(converted.getTime());
    }
    if (value && typeof value.toDate === 'function') {
        try {
            const converted = value.toDate();
            return converted instanceof Date && !Number.isNaN(converted.getTime())
                ? new Date(converted.getTime())
                : null;
        } catch (error) {
            return null;
        }
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const isoCandidate = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`);
        if (!Number.isNaN(isoCandidate.getTime())) {
            return isoCandidate;
        }
        const fallback = new Date(trimmed);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
    return null;
}

function parseDateOnly(value) {
    const date = coerceToDate(value);
    if (!date) return null;
    const normalized = new Date(date.getTime());
    normalized.setHours(0, 0, 0, 0);
    return normalized;
}

function parseDateValue(value) {
    return coerceToDate(value);
}

function addDays(date, amount) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const result = new Date(date);
    result.setDate(result.getDate() + amount);
    result.setHours(0, 0, 0, 0);
    return result;
}

function getSafeDueDate(startDate, dueDate) {
    const startDateObj = parseDateOnly(startDate);
    const dueDateObj = parseDateOnly(dueDate);
    if (dueDateObj) {
        dueDateObj.setHours(0, 0, 0, 0);
        return dueDateObj;
    }
    if (!startDateObj) return null;
    return addDays(startDateObj, MIN_BAR_DURATION_DAYS - 1);
}

function getSafeDueDateISO(startDate, dueDate) {
    const safeDueDate = getSafeDueDate(startDate, dueDate);
    return safeDueDate ? safeDueDate.toISOString().split('T')[0] : null;
}

function getDayOfYear(date) {
    if (!date) return 0;
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date - start) / MILLISECONDS_IN_DAY);
}

function clampDateToRange(date, min, max) {
    if (!date) return null;
    const clampedTime = Math.min(Math.max(date.getTime(), min.getTime()), max.getTime());
    const clamped = new Date(clampedTime);
    clamped.setHours(0, 0, 0, 0);
    return clamped;
}

function calculatePlanSegment(year, startDate, endDate) {
    const totalDays = isLeapYear(year) ? 366 : 365;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const clampedStart = clampDateToRange(startDate, yearStart, yearEnd);
    const clampedEnd = clampDateToRange(endDate, yearStart, yearEnd);
    if (!clampedStart || !clampedEnd || clampedEnd < clampedStart) {
        return null;
    }

    const startDay = getDayOfYear(clampedStart);
    const endDay = getDayOfYear(clampedEnd);
    const leftPercent = Math.max(0, ((startDay - 1) / totalDays) * 100);
    const widthPercent = Math.max(0.5, ((endDay - startDay + 1) / totalDays) * 100);

    return { leftPercent, widthPercent, clampedStart, clampedEnd };
}

function formatDisplayDate(value, options = {}) {
    const { includeYear = true } = options;
    const date = parseDateValue(value);
    if (!date) return '—';
    const formatOptions = { day: '2-digit', month: 'short' };
    if (includeYear) {
        formatOptions.year = 'numeric';
    }
    const parts = new Intl.DateTimeFormat('es-AR', formatOptions).formatToParts(date);
    const dayPart = parts.find(part => part.type === 'day')?.value ?? '';
    const monthPart = parts.find(part => part.type === 'month')?.value ?? '';
    const yearPart = includeYear ? (parts.find(part => part.type === 'year')?.value ?? '') : '';
    const normalizedMonth = monthPart ? monthPart.charAt(0).toUpperCase() + monthPart.slice(1) : '';
    return includeYear
        ? `${dayPart} ${normalizedMonth} ${yearPart}`.trim()
        : `${dayPart} ${normalizedMonth}`.trim();
}

function getTaskDurationLabel(startDate, dueDate) {
    const startDateObj = parseDateOnly(startDate);
    const dueDateObj = getSafeDueDate(startDate, dueDate);
    if (!startDateObj || !dueDateObj || dueDateObj < startDateObj) {
        return '—';
    }
    const diffDays = Math.max(1, Math.round((dueDateObj - startDateObj) / MILLISECONDS_IN_DAY) + 1);
    const weeks = diffDays / 7;
    if (weeks < 1) return `${diffDays} días`;
    if (Number.isInteger(weeks)) return `${weeks} sem`;
    return `${weeks.toFixed(1)} sem`;
}

function getTaskDateRangeLabel(startDate, dueDate) {
    const safeDueDateISO = getSafeDueDateISO(startDate, dueDate);
    const start = formatDisplayDate(startDate, { includeYear: false });
    const end = formatDisplayDate(safeDueDateISO, { includeYear: false });
    if (start === '—' && end === '—') {
        return 'Sin fechas';
    }
    if (start === '—') {
        return `Hasta ${end}`;
    }
    if (end === '—') {
        return `Desde ${start}`;
    }
    return `${start} → ${end}`;
}

function getAssigneeOptions(tasks = []) {
    const users = appState?.collectionsById?.usuarios || new Map();
    const options = new Map();
    tasks.forEach(task => {
        const uid = task.assigneeUid || '__unassigned__';
        const userRecord = uid !== '__unassigned__' ? users.get(uid) : null;
        const label = task.assigneeName
            || userRecord?.name
            || userRecord?.displayName
            || (uid === '__unassigned__' ? 'Sin responsable' : 'Sin nombre');
        options.set(uid, label);
    });
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
}

function filterTasksByAssignee(tasks = [], assigneeFilter = 'all') {
    if (assigneeFilter === 'all') return tasks;
    if (assigneeFilter === '__unassigned__') {
        return tasks.filter(task => !task.assigneeUid);
    }
    return tasks.filter(task => task.assigneeUid === assigneeFilter);
}

function renderAssigneeSelectOptions(options = [], selectedValue = 'all') {
    const seen = new Set();
    const normalized = options.filter(option => {
        if (!option || !option.value) return false;
        if (seen.has(option.value)) return false;
        seen.add(option.value);
        return true;
    }).map(option => ({
        value: option.value,
        label: option.label || 'Sin responsable'
    }));

    normalized.sort((a, b) => a.label.localeCompare(b.label));

    const hasUnassigned = normalized.some(option => option.value === '__unassigned__');
    const filtered = normalized.filter(option => option.value !== '__unassigned__');
    if (hasUnassigned) {
        filtered.push({ value: '__unassigned__', label: 'Sin responsable' });
    }

    const finalOptions = [{ value: 'all', label: 'Todos' }, ...filtered];

    return finalOptions.map(option => `
        <option value="${option.value}" ${option.value === selectedValue ? 'selected' : ''}>${escapeHTML(option.label)}</option>
    `).join('');
}

function buildSamplePlanningTasks(range) {
    const year = new Date(range?.startDate || new Date()).getFullYear();
    const sampleBaseDate = new Date(year, 0, 15);
    const formatISO = (date) => date.toISOString().split('T')[0];
    const createTask = (index, title, offsetStart, durationDays, progress, assigneeName, status = 'inprogress') => {
        const start = new Date(sampleBaseDate);
        start.setDate(start.getDate() + offsetStart);
        const end = new Date(start);
        end.setDate(start.getDate() + Math.max(durationDays - 1, 0));
        return {
            id: `sample-${index}`,
            title,
            startDate: formatISO(start),
            dueDate: formatISO(end),
            status,
            progress,
            assigneeUid: `sample-assignee-${index}`,
            assigneeName,
            isSample: true
        };
    };
    return augmentTasksWithSchedule([
        createTask(1, 'Lanzamiento campaña Q1', 10, 35, 65, 'Equipo Comercial'),
        createTask(2, 'Implementar nuevo CRM', 50, 70, 35, 'Operaciones', 'todo'),
        createTask(3, 'Auditoría de procesos', 110, 28, 90, 'Calidad', 'done'),
        createTask(4, 'Despliegue regional', 170, 90, 20, 'Expansión'),
        createTask(5, 'Capacitación de ventas', 260, 30, 10, 'Recursos Humanos')
    ]);
}

function getWeekRangeString(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const format = (dt) => `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()].slice(0,3)}`;
    if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()} - ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]}, ${sunday.getFullYear()}`;
    else if (monday.getFullYear() === sunday.getFullYear()) return `${format(monday)} - ${format(sunday)}, ${sunday.getFullYear()}`;
    else return `${format(monday)}, ${monday.getFullYear()} - ${format(sunday)}, ${sunday.getFullYear()}`;
}

function dateToDayOfYear(value, year) {
    const date = parseDateOnly(value);
    if (!date || date.getFullYear() !== year) return 0;
    const start = new Date(year, 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function dateToDayOfMonth(value, dateInMonth) {
    const date = parseDateOnly(value);
    if (!date) return 0;
    if (date.getFullYear() !== dateInMonth.getFullYear() || date.getMonth() !== dateInMonth.getMonth()) return 0;
    return date.getDate();
}

function dateToDayOfWeek(value, weekStartDate) {
    const date = parseDateOnly(value);
    if (!date) return 0;
    const normalizedWeekStart = parseDateOnly(weekStartDate);
    if (!normalizedWeekStart) return 0;
    const diff = date - normalizedWeekStart;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayIndex = Math.floor(diff / oneDay);
    return dayIndex + 1;
}

function dayOfYearToDate(day, year) {
    const date = new Date(year, 0, day);
    return date.toISOString().split('T')[0];
}

function dayOfMonthToDate(day, month, year) {
    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
}

function dayOfWeekToDate(day, weekStartDate) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + day - 1);
    return date.toISOString().split('T')[0];
}

function pixelsToDays(pixelValue, totalWidth, daysInPeriod, options = {}) {
    const { enforcePositiveMinimum = false } = options;
    if (totalWidth === 0) return 0;
    const pixelsPerDay = totalWidth / daysInPeriod;
    if (pixelsPerDay === 0) return 0;
    const days = Math.round(pixelValue / pixelsPerDay);
    if (enforcePositiveMinimum && pixelValue > 0) {
        return Math.max(1, days);
    }
    return days;
}

async function updateTaskDates(taskId, newStartDate, newEndDate) {
    if (!db || !taskId || taskId.startsWith('sample-')) {
        if (taskId && taskId.startsWith('sample-')) {
            window.showToast('Los datos de ejemplo no se pueden editar.', 'info');
        }
        return false;
    }
    const toastId = window.showToast('Guardando cambios...', 'loading', { duration: 0 });
    try {
        const taskRef = doc(db, 'tareas', taskId);
        const startDateObj = parseDateOnly(newStartDate);
        const endDateObj = parseDateOnly(newEndDate);
        await updateDocFn(taskRef, {
            startDate: startDateObj ? Timestamp.fromDate(startDateObj) : null,
            dueDate: endDateObj ? Timestamp.fromDate(endDateObj) : null,
            endDate: endDateObj ? Timestamp.fromDate(endDateObj) : null
        });
        window.showToast('Tarea actualizada.', 'success', { toastId });
        return true;
    } catch (error) {
        console.error("Error updating task dates:", error);
        window.showToast('Error al guardar la tarea.', 'error', { toastId });
        return false;
    }
}

async function updateTaskProgress(taskId, progressValue) {
    if (!db || !taskId || taskId.startsWith('sample-')) {
        if (taskId && taskId.startsWith('sample-')) {
            window.showToast('Los datos de ejemplo no se pueden editar.', 'info');
        }
        return false;
    }
    const toastId = window.showToast('Actualizando progreso...', 'loading', { duration: 0 });
    try {
        const taskRef = doc(db, 'tareas', taskId);
        await updateDocFn(taskRef, { progress: progressValue });
        window.showToast('Progreso actualizado.', 'success', { toastId });
        return true;
    } catch (error) {
        console.error('Error updating task progress:', error);
        window.showToast('No se pudo guardar el progreso.', 'error', { toastId });
        return false;
    }
}

function assignLanesToTasks(tasks, context) {
    if (!tasks || tasks.length === 0) return { lanedTasks: [], totalLanes: 0 };
    const { zoomLevel, visibleDate } = context;
    const year = visibleDate.getFullYear();
    const users = appState?.collectionsById?.usuarios || new Map();

    const processedTasks = tasks.map(task => {
        const enriched = task.schedule ? task : augmentTaskWithSchedule(task);
        const schedule = enriched.schedule || {};
        const assignee = users.get(enriched.assigneeUid);
        const assigneeName = enriched.assigneeName || assignee?.name || assignee?.displayName || '';

        const planStartISO = schedule.planStartDate
            ? schedule.planStartDate.toISOString().split('T')[0]
            : enriched.startDate;
        const planEndISO = schedule.planEndDate
            ? schedule.planEndDate.toISOString().split('T')[0]
            : getSafeDueDateISO(enriched.startDate, enriched.dueDate);

        let startDay, endDay, originalStartDay, originalEndDay;
        if (zoomLevel === 'year') {
            const daysInYear = isLeapYear(year) ? 366 : 365;
            originalStartDay = dateToDayOfYear(planStartISO, year);
            originalEndDay = dateToDayOfYear(planEndISO, year);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(daysInYear, originalEndDay);
        } else if (zoomLevel === 'month') {
            const month = visibleDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            originalStartDay = dateToDayOfMonth(planStartISO, visibleDate);
            originalEndDay = dateToDayOfMonth(planEndISO, visibleDate);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(daysInMonth, originalEndDay);
        } else if (zoomLevel === 'week') {
            const d = new Date(visibleDate);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            originalStartDay = dateToDayOfWeek(planStartISO, monday);
            originalEndDay = dateToDayOfWeek(planEndISO, monday);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(7, originalEndDay);
        }
        return {
            ...enriched,
            startDay,
            endDay,
            originalStartDay,
            originalEndDay,
            assigneeName,
            effectiveDueDate: planEndISO || null
        };
    })
    .filter(t => t.startDay && t.endDay && t.endDay >= t.startDay)
    .sort((a, b) => a.startDay - b.startDay);

    const lanes = [];
    processedTasks.forEach(task => {
        let assigned = false;
        for (let i = 0; i < lanes.length; i++) {
            if (task.startDay > lanes[i]) {
                task.laneIndex = i;
                lanes[i] = task.endDay;
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            task.laneIndex = lanes.length;
            lanes.push(task.endDay);
        }
    });

    return { lanedTasks: processedTasks, totalLanes: lanes.length };
}

function getTimelineScaleHTML(zoomLevel, date) {
    const year = date.getFullYear();
    switch (zoomLevel) {
        case 'week':
            let weekHtml = '';
            const monday = new Date(date);
            monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
            for (let i = 0; i < 7; i++) {
                const day = new Date(monday);
                day.setDate(monday.getDate() + i);
                weekHtml += `<div class="timescale-day"><span class="timescale-day-name">${DAY_NAMES[day.getDay()]}</span><span class="timescale-day-number">${day.getDate()}</span></div>`;
            }
            return `
                <div class="timescale-year-row">Semana ${getWeekRangeString(date)}</div>
                <div class="timescale-day-track" style="grid-template-columns: repeat(7, minmax(${WEEK_DAY_COLUMN_MIN_WIDTH}px, 1fr));">
                    ${weekHtml}
                </div>
            `;
        case 'month':
            const month = date.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const weeksInMonth = Math.ceil(daysInMonth / 7);
            let weekLabels = '';
            for (let i = 0; i < weeksInMonth; i++) {
                weekLabels += `<div class="timescale-week">S${(i + 1).toString().padStart(2, '0')}</div>`;
            }
            let daysHtml = '';
            for (let i = 1; i <= daysInMonth; i++) {
                daysHtml += `<div class="timescale-day"><span class="timescale-day-number">${i}</span></div>`;
            }
            return `
                <div class="timescale-year-row">${MONTH_NAMES[month]} ${year}</div>
                <div class="timescale-week-track" style="grid-template-columns: repeat(${weeksInMonth}, minmax(0, 1fr));">
                    ${weekLabels}
                </div>
                <div class="timescale-day-track" style="grid-template-columns: repeat(${daysInMonth}, minmax(${MONTH_DAY_COLUMN_MIN_WIDTH}px, 1fr));">
                    ${daysHtml}
                </div>
            `;
        case 'year':
        default:
            const totalDays = isLeapYear(year) ? 366 : 365;
            const daysInMonths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            const monthSegments = daysInMonths.map((days, index) => `
                <div class="timescale-month-segment" style="grid-column: span ${days};">
                    <span>${MONTH_ABBREVIATIONS[index]}</span>
                </div>
            `).join('');
            const dayTicks = Array.from({ length: totalDays }, (_, index) => {
                const currentDate = new Date(year, 0, index + 1);
                const isMonthStart = currentDate.getDate() === 1;
                const isMonday = currentDate.getDay() === 1;
                const shouldLabel = isMonthStart || isMonday;
                const label = shouldLabel ? currentDate.getDate().toString().padStart(2, '0') : '';
                return `<div class="timescale-day-tick${shouldLabel ? ' labeled' : ''}">${label}</div>`;
            }).join('');
            return `
                <div class="timescale-year-row"><span class="timescale-year-chip">${year}</span></div>
                <div class="timescale-month-track" style="grid-template-columns: repeat(${totalDays}, minmax(${YEAR_DAY_COLUMN_MIN_WIDTH}px, 1fr));">
                    ${monthSegments}
                </div>
                <div class="timescale-day-track" style="grid-template-columns: repeat(${totalDays}, minmax(${YEAR_DAY_COLUMN_MIN_WIDTH}px, 1fr));">
                    ${dayTicks}
                </div>
            `;
    }
}

function getGridLinesHTML(zoomLevel, date) {
    const year = date.getFullYear();
    let linesHTML = '';
    let today = new Date();
    switch (zoomLevel) {
        case 'week':
            for (let i = 1; i < 7; i++) { linesHTML += `<div class="grid-line" style="left: ${(i / 7) * 100}%;"></div>`; }
            break;
        case 'month':
            const month = date.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let i = 1; i < daysInMonth; i++) { linesHTML += `<div class="grid-line" style="left: ${(i / daysInMonth) * 100}%;"></div>`; }
            if (today.getFullYear() === year && today.getMonth() === month) {
                const todayDay = today.getDate();
                linesHTML += `<div class="today-marker" style="left: ${((todayDay - 0.5) / daysInMonth) * 100}%;"><span class="today-label">Hoy</span></div>`;
            }
            break;
        case 'year':
        default:
            const daysInYear = isLeapYear(year) ? 366 : 365;
            const daysInMonths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let dayCounter = 0;
            for (let i = 0; i < 11; i++) {
                dayCounter += daysInMonths[i];
                linesHTML += `<div class="grid-line" style="left: ${(dayCounter / daysInYear) * 100}%;"></div>`;
            }
            if (today.getFullYear() === year) {
                const todayDayOfYear = dateToDayOfYear(today.toISOString().split('T')[0], year);
                linesHTML += `<div class="today-marker" style="left: ${(todayDayOfYear / daysInYear) * 100}%;"><span class="today-label">Hoy</span></div>`;
            }
            break;
    }
    return linesHTML;
}

function formatTimelineTasksFromDocs(docs, range) {
    if (!Array.isArray(docs) || !range) return [];
    const { startDate, endDate } = range;
    const tasks = docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(task => !task.archived && taskOverlapsRange(task, startDate, endDate));
    return augmentTasksWithSchedule(tasks);
}

function subscribeTimelineTasks(range, callback) {
    if (typeof unsubscribeTasks === 'function') {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    if (!db || !range || typeof callback !== 'function') {
        return null;
    }
    const { endDate } = range;
    const tasksRef = collection(db, 'tareas');
    const endBoundary = parseDateOnly(endDate);
    const constraints = [where('showInPlanning', '==', true)];
    if (endBoundary) {
        const boundary = new Date(endBoundary.getTime());
        boundary.setHours(23, 59, 59, 999);
        constraints.push(where('startDate', '<=', Timestamp.fromDate(boundary)));
    }
    constraints.push(orderBy('startDate', 'asc'));
    const q = query(tasksRef, ...constraints);
    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        try {
            const tasks = formatTimelineTasksFromDocs(snapshot.docs, range);
            callback(tasks);
        } catch (callbackError) {
            console.error('Error processing timeline tasks snapshot:', callbackError);
        }
    }, (error) => {
        console.error('Error subscribing to timeline tasks:', error);
        window.showToast('Error al cargar las tareas.', 'error');
        callback([]);
    });
    return unsubscribeTasks;
}

async function fetchTimelineTasks(range) {
    if (!db || !range) return [];
    try {
        const { endDate } = range;
        const tasksRef = collection(db, 'tareas');
        const endBoundary = parseDateOnly(endDate);
        const constraints = [where('showInPlanning', '==', true)];
        if (endBoundary) {
            const boundary = new Date(endBoundary.getTime());
            boundary.setHours(23, 59, 59, 999);
            constraints.push(where('startDate', '<=', Timestamp.fromDate(boundary)));
        }
        constraints.push(orderBy('startDate', 'asc'));
        const q = query(tasksRef, ...constraints);
        const querySnapshot = await getDocs(q);
        return formatTimelineTasksFromDocs(querySnapshot.docs, range);
    } catch (error) {
        console.error("Error fetching timeline tasks:", error);
        window.showToast("Error al cargar las tareas.", "error");
        return [];
    }
}

async function fetchSummaryTasks(year) {
    if (!db) return [];
    try {
        const range = { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
        return fetchTimelineTasks(range);
    } catch (error) {
        console.error("Error fetching summary tasks:", error);
        window.showToast("No se pudo actualizar el resumen del planning anual.", "error");
        return [];
    }
}

function formatPlanningKeyDatesFromDocs(docs) {
    if (!Array.isArray(docs)) return [];
    return docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function subscribePlanningKeyDates(range, callback) {
    if (typeof unsubscribeKeyDates === 'function') {
        unsubscribeKeyDates();
        unsubscribeKeyDates = null;
    }
    if (!db || !range || typeof callback !== 'function') {
        return null;
    }
    const { startDate, endDate } = range;
    const keyDatesRef = collection(db, 'planning_key_dates');
    const keyDatesQuery = query(
        keyDatesRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
    );
    unsubscribeKeyDates = onSnapshot(keyDatesQuery, (snapshot) => {
        try {
            const keyDates = formatPlanningKeyDatesFromDocs(snapshot.docs);
            callback(keyDates);
        } catch (callbackError) {
            console.error('Error processing planning key dates snapshot:', callbackError);
        }
    }, (error) => {
        console.error('Error subscribing to planning key dates:', error);
        window.showToast('No se pudieron cargar las fechas clave del planning.', 'error');
        callback([]);
    });
    return unsubscribeKeyDates;
}

async function fetchKeyDates(range) {
    if (!db || !range) return [];
    try {
        const { startDate, endDate } = range;
        const keyDatesRef = collection(db, 'planning_key_dates');
        const keyDatesQuery = query(
            keyDatesRef,
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            orderBy('date', 'asc')
        );
        const snapshot = await getDocs(keyDatesQuery);
        return formatPlanningKeyDatesFromDocs(snapshot.docs);
    } catch (error) {
        console.error('Error fetching planning key dates:', error);
        window.showToast('No se pudieron cargar las fechas clave del planning.', 'error');
        return [];
    }
}

function getKeyDateRenderData(keyDates, context) {
    if (!Array.isArray(keyDates) || !context) return [];
    const { zoomLevel, visibleDate } = context;
    const range = getPeriodRange(zoomLevel, visibleDate);
    const startBoundary = parseDateOnly(range.startDate);
    const endBoundary = parseDateOnly(range.endDate);
    if (!startBoundary || !endBoundary) return [];

    const totalDays = getDaysInPeriod(context);
    const monday = (() => {
        if (zoomLevel !== 'week') return null;
        const d = new Date(visibleDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    })();

    return keyDates
        .map(keyDate => {
            const dateObj = parseDateOnly(keyDate.date);
            if (!dateObj || dateObj < startBoundary || dateObj > endBoundary) {
                return null;
            }

            let dayIndex = 0;
            if (zoomLevel === 'year') {
                dayIndex = dateToDayOfYear(keyDate.date, visibleDate.getFullYear());
            } else if (zoomLevel === 'month') {
                dayIndex = dateToDayOfMonth(keyDate.date, visibleDate);
            } else if (zoomLevel === 'week' && monday) {
                dayIndex = dateToDayOfWeek(keyDate.date, monday);
            }

            if (!dayIndex || dayIndex < 1) {
                return null;
            }

            const safeLeft = Math.min(99.5, Math.max(0, ((dayIndex - 1) / totalDays) * 100));
            return {
                ...keyDate,
                title: escapeHTML(keyDate.title || 'Fecha clave'),
                description: escapeHTML(keyDate.description || ''),
                dateObj,
                dayIndex,
                leftPercent: safeLeft
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.dateObj - b.dateObj);
}

function getKeyDateTrackHTML(keyDates, context) {
    const renderData = getKeyDateRenderData(keyDates, context);
    if (renderData.length === 0) {
        return `
            <div class="timescale-keydates-row empty">
                <div class="timescale-keydates-empty">Sin fechas clave cargadas para este período.</div>
            </div>
        `;
    }

    return `
        <div class="timescale-keydates-row">
            <div class="timescale-keydates-track">
                ${renderData.map(item => `
                    <div class="timescale-keydates-item" style="left: ${item.leftPercent}%" title="${item.title} · ${formatDisplayDate(item.date)}">
                        <span class="timescale-keydates-dot"></span>
                        <span class="timescale-keydates-label">
                            <span class="timescale-keydates-label-date">${formatDisplayDate(item.date)}</span>
                            <span class="timescale-keydates-label-text">${item.title}</span>
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function getKeyDateMarkersHTML(keyDates, context) {
    const renderData = getKeyDateRenderData(keyDates, context);
    if (renderData.length === 0) return '';
    return renderData.map(item => `
        <div class="key-date-marker" style="left: ${item.leftPercent}%" title="${item.title} · ${formatDisplayDate(item.date)}">
            <span class="key-date-marker-line"></span>
            <span class="key-date-marker-dot"></span>
        </div>
    `).join('');
}

function getTaskListHTML(tasks, context) {
    if (!tasks || tasks.length === 0) {
        return `<p class="py-8 text-sm text-center text-slate-500 dark:text-slate-400">No hay tareas para este período.</p>`;
    }
    const sortedTasks = [...tasks].sort((a, b) => a.startDay - b.startDay);
    return sortedTasks.map(task => {
        const schedule = task.schedule || {};
        const stateDisplay = getTaskStateDisplay(schedule);
        const state = stateDisplay.state;
        const title = escapeHTML(task.title || 'Tarea sin título');
        const planStartISO = schedule.planStartDate ? schedule.planStartDate.toISOString().split('T')[0] : task.startDate;
        const planEndISO = schedule.planEndDate ? schedule.planEndDate.toISOString().split('T')[0] : (task.effectiveDueDate ?? task.dueDate);
        const durationLabel = getTaskDurationLabel(planStartISO, planEndISO);
        const progressValue = Math.round(Number.isFinite(schedule.progressPercent) ? schedule.progressPercent : getTaskProgressValue(task));
        const sampleBadge = task.isSample ? '<span class="task-demo-pill">Ejemplo</span>' : '';
        const sliderAttributes = task.isSample ? 'disabled data-sample="true"' : `data-task-id="${task.id}"`;
        const dataAttributes = task.isSample ? `data-task-id="${task.id}" data-sample="true"` : `data-task-id="${task.id}"`;
        const rangeLabel = schedule.hasPlanRange
            ? formatPlannedRange(schedule)
            : getTaskDateRangeLabel(planStartISO, planEndISO);
        const startLabel = formatDisplayDate(planStartISO, { includeYear: false });
        const startFullLabel = formatDisplayDate(planStartISO);
        const startYear = parseDateValue(planStartISO)?.getFullYear();
        const dueLabel = formatDisplayDate(planEndISO, { includeYear: false });
        const dueFullLabel = formatDisplayDate(planEndISO);
        const dueYear = parseDateValue(planEndISO)?.getFullYear();
        const tooltipText = formatTaskScheduleTooltip(task, schedule);
        const delayDays = schedule.atrasoDias ?? 0;
        const chipHTML = getTaskStateChipHTML(schedule, { tooltip: tooltipText });
        const plannedProgressRaw = Number.isFinite(schedule.plannedProgressPercent)
            ? schedule.plannedProgressPercent
            : Number.isFinite(schedule.plannedProgress)
                ? schedule.plannedProgress * 100
                : progressValue;
        const plannedProgressValue = Math.max(0, Math.min(100, Math.round(plannedProgressRaw)));
        const deltaPointsRaw = Number.isFinite(schedule.deltaPercentagePoints)
            ? schedule.deltaPercentagePoints
            : ((Number.isFinite(schedule.progressPercent) ? schedule.progressPercent : progressValue) - plannedProgressValue);
        const deltaLabel = `${formatSignedPoints(deltaPointsRaw)} pp`;
        const planProgressLabel = schedule.hasPlanRange ? `Plan ${plannedProgressValue}%` : 'Plan —';
        return `
            <div class="task-table-row ${task.isSample ? 'sample' : ''}" ${dataAttributes} data-task-state="${state}" title="${title}">
                <div class="task-col task-col--main">
                    <div class="task-title-row">
                        <p class="task-title" title="${title}">${title}</p>
                        ${sampleBadge}
                    </div>
                    <div class="task-meta-line" title="${tooltipText}">
                        <span class="task-date-range">${rangeLabel}</span>
                        ${chipHTML}
                    </div>
                </div>
                <div class="task-col task-col--date" title="Inicio: ${startFullLabel}">
                    <span class="task-date-value">${startLabel}</span>
                    ${startYear ? `<span class="task-date-year">${startYear}</span>` : ''}
                </div>
                <div class="task-col task-col--date" title="Fin: ${dueFullLabel}">
                    <span class="task-date-value">${dueLabel}</span>
                    ${dueYear ? `<span class="task-date-year">${dueYear}</span>` : ''}
                    ${state === TASK_STATE.DELAYED ? `<span class="task-delay-indicator" data-task-state="${state}">${delayDays > 0 ? `+${delayDays}d` : 'Atraso'}</span>` : ''}
                </div>
                <div class="task-col task-col--progress">
                    <div class="task-progress-display" title="${tooltipText}">
                        <div class="task-progress-bar">
                            <span class="task-plan-marker" style="left: ${plannedProgressValue}%;"></span>
                            <div class="task-progress-fill" style="width: ${progressValue}%;"></div>
                        </div>
                        <span class="task-progress-value">${progressValue}%</span>
                    </div>
                    <div class="task-progress-controls">
                        <span class="task-plan-progress-label">${planProgressLabel}</span>
                        <input type="range" min="0" max="100" value="${progressValue}" class="task-progress-slider" ${sliderAttributes}>
                        <span class="task-duration">${durationLabel}</span>
                        <span class="task-delta-indicator" data-task-state="${state}" title="Diferencia versus plan">Δ ${deltaLabel}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getTaskBarsHTML(lanedTasks, context) {
    if (!lanedTasks) return '';
    const { zoomLevel, visibleDate } = context;
    const year = visibleDate.getFullYear();
    const month = visibleDate.getMonth();
    const daysInPeriod = zoomLevel === 'year' ? (isLeapYear(year) ? 366 : 365) : zoomLevel === 'month' ? new Date(year, month + 1, 0).getDate() : 7;

    return lanedTasks.map(task => {
        const schedule = task.schedule || {};
        const stateDisplay = getTaskStateDisplay(schedule);
        const state = stateDisplay.state;
        const safeTitle = escapeHTML(task?.title ?? '');
        const startLabel = schedule.planStartDate
            ? schedule.planStartDate.toISOString().split('T')[0]
            : (formatDateForInput(task?.startDate) || '');
        const endLabel = schedule.planEndDate
            ? schedule.planEndDate.toISOString().split('T')[0]
            : (formatDateForInput(task?.effectiveDueDate ?? task?.dueDate) || '');
        const dateSegment = startLabel || endLabel
            ? ` (${escapeHTML(startLabel || '—')} - ${escapeHTML(endLabel || '—')})`
            : '';
        const tooltipText = formatTaskScheduleTooltip(task, schedule);
        const leftPercent = ((task.startDay - 1) / daysInPeriod) * 100;
        const widthPercent = ((task.endDay - task.startDay + 1) / daysInPeriod) * 100;
        const topPosition = task.laneIndex * (TASK_BAR_HEIGHT + TASK_BAR_GAP) + TASK_BAR_GAP;
        const progress = Math.max(0, Math.min(100, Math.round(Number.isFinite(schedule.progressPercent)
            ? schedule.progressPercent
            : getTaskProgressValue(task))));
        const plannedProgressRaw = Number.isFinite(schedule.plannedProgressPercent)
            ? schedule.plannedProgressPercent
            : Number.isFinite(schedule.plannedProgress)
                ? schedule.plannedProgress * 100
                : progress;
        const plannedProgressValue = Math.max(0, Math.min(100, Math.round(plannedProgressRaw)));
        const barClasses = `task-bar${task.isSample ? ' sample' : ''}`;
        const iconMarkup = stateDisplay.icon ? `<i data-lucide="${stateDisplay.icon}" class="w-3 h-3"></i>` : '';
        const badgeLabel = state === TASK_STATE.DELAYED
            ? `${iconMarkup}${schedule.atrasoDias ? ` +${schedule.atrasoDias}d` : ' Atraso'}`.trim()
            : '';
        const alertBadge = state === TASK_STATE.DELAYED
            ? `<span class="task-bar-alert" data-task-state="${state}">${badgeLabel}</span>`
            : '';
        return `<div class="${barClasses}" data-task-id="${task.id}" data-task-state="${state}" style="left: ${leftPercent}%; width: ${widthPercent}%; top: ${topPosition}px;" title="${tooltipText}"><span class="task-plan-marker" style="left: ${plannedProgressValue}%;"></span><div class="task-bar-progress" style="width: ${progress}%;"></div><span class="task-bar-label">${safeTitle}</span>${alertBadge}</div>`;
    }).join('');
}

function setupTimelineInteractions(lanedTasks, context) {
    const taskList = document.querySelector('.timeline-task-list');
    const taskGrid = document.querySelector('.timeline-grid');
    const container = document.querySelector('.timeline-container');
    const gridContent = document.querySelector('.timeline-grid-content');
    if (!taskList || !taskGrid || !container || !gridContent) return;

    currentLanedTasks = Array.isArray(lanedTasks) ? lanedTasks : [];

    if (!scrollHandlersBound) {
        taskList.addEventListener('scroll', onTaskListScroll);
        taskGrid.addEventListener('scroll', onTaskGridScroll);
        scrollHandlersBound = true;
    }

    if (!containerHoverHandlersBound) {
        container.addEventListener('mouseover', handleTaskHoverEnter);
        container.addEventListener('mouseout', handleTaskHoverLeave);
        containerHoverHandlersBound = true;
    }

    if (!taskListHandlersBound) {
        taskList.addEventListener('click', handleTaskListClick);
        taskList.addEventListener('contextmenu', handleTaskListContextMenu);
        taskListHandlersBound = true;
    }

    if (!gridHandlersBound) {
        gridContent.addEventListener('dblclick', handleTimelineGridDoubleClick);
        gridContent.addEventListener('click', handleTaskBarClick);
        gridContent.addEventListener('contextmenu', handleTaskBarContextMenu);
        gridHandlersBound = true;
    }

    if (window.interact) {
        const { zoomLevel, visibleDate } = context;
        const year = visibleDate.getFullYear();
        const month = visibleDate.getMonth();
        const daysInPeriod = zoomLevel === 'year'
            ? (isLeapYear(year) ? 366 : 365)
            : zoomLevel === 'month'
                ? new Date(year, month + 1, 0).getDate()
                : 7;

        const tasksForDrag = Array.isArray(lanedTasks) ? lanedTasks : [];

        const dateFromDay = (day) => {
            if (zoomLevel === 'year') {
                return dayOfYearToDate(day, year);
            }
            if (zoomLevel === 'month') {
                return dayOfMonthToDate(day, month, year);
            }
            const d = new Date(visibleDate);
            const dayOfWeek = d.getDay();
            const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            return dayOfWeekToDate(day, monday);
        };

        window.interact('.task-bar').draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    const taskId = target.dataset.taskId;
                    const task = tasksForDrag.find(t => t.id === taskId);
                    if (!task || task.isSample) {
                        event?.interaction?.stop();
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                        return;
                    }
                    target.dataset.dragging = 'true';
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    target.style.transform = `translate(${x}px, 0px)`;
                    target.setAttribute('data-x', x);
                },
                async end(event) {
                    const target = event.target;
                    const taskId = target.dataset.taskId;
                    const task = tasksForDrag.find(t => t.id === taskId);
                    target.removeAttribute('data-dragging');
                    if (!task || task.isSample) {
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                        return;
                    }

                    const x = parseFloat(target.getAttribute('data-x')) || 0;
                    const dayOffset = pixelsToDays(x, gridContent.offsetWidth, daysInPeriod);

                    const newStartDay = task.originalStartDay + dayOffset;
                    const duration = task.originalEndDay - task.originalStartDay;
                    const newEndDay = newStartDay + duration;

                    const newStartDate = dateFromDay(newStartDay);
                    const newEndDate = dateFromDay(newEndDay);

                    const success = await updateTaskDates(taskId, newStartDate, newEndDate);
                    if (!success) {
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                    }
                    renderTimeline();
                }
            }
        }).resizable({
            edges: { left: true, right: true },
            listeners: {
                move(event) {
                    const target = event.target;
                    const taskId = target.dataset.taskId;
                    const task = tasksForDrag.find(t => t.id === taskId);
                    if (!task || task.isSample) {
                        event?.interaction?.stop();
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                        return;
                    }
                    target.dataset.resizing = 'true';
                    let x = (parseFloat(target.getAttribute('data-x')) || 0);
                    target.style.width = `${event.rect.width}px`;
                    x += event.deltaRect.left;
                    target.style.transform = `translate(${x}px, 0px)`;
                    target.setAttribute('data-x', x);
                },
                async end(event) {
                    const target = event.target;
                    const taskId = target.dataset.taskId;
                    const task = tasksForDrag.find(t => t.id === taskId);
                    target.removeAttribute('data-resizing');
                    if (!task || task.isSample) {
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                        return;
                    }

                    const x = parseFloat(target.getAttribute('data-x')) || 0;
                    const dayOffset = pixelsToDays(x, gridContent.offsetWidth, daysInPeriod);
                    const widthInPixels = event.rect.width;
                    const rawDurationInDays = pixelsToDays(
                        widthInPixels,
                        gridContent.offsetWidth,
                        daysInPeriod,
                        { enforcePositiveMinimum: true }
                    );
                    const durationInDays = Math.max(1, rawDurationInDays);

                    const newStartDay = task.originalStartDay + dayOffset;
                    const newEndDay = newStartDay + durationInDays - 1;

                    const newStartDate = dateFromDay(newStartDay);
                    const newEndDate = dateFromDay(newEndDay);

                    const success = await updateTaskDates(taskId, newStartDate, newEndDate);
                    if (!success) {
                        target.style.transform = '';
                        target.removeAttribute('data-x');
                    }
                    renderTimeline();
                }
            }
        });
    }
}

function detachTimelineInteractions() {
    const taskList = document.querySelector('.timeline-task-list');
    const taskGrid = document.querySelector('.timeline-grid');
    const container = document.querySelector('.timeline-container');
    const gridContent = document.querySelector('.timeline-grid-content');

    if (taskList && taskListHandlersBound) {
        taskList.removeEventListener('click', handleTaskListClick);
        taskList.removeEventListener('contextmenu', handleTaskListContextMenu);
        taskListHandlersBound = false;
    }

    if (taskList && scrollHandlersBound) {
        taskList.removeEventListener('scroll', onTaskListScroll);
    }

    if (taskGrid && scrollHandlersBound) {
        taskGrid.removeEventListener('scroll', onTaskGridScroll);
    }

    scrollHandlersBound = false;

    if (container && containerHoverHandlersBound) {
        container.removeEventListener('mouseover', handleTaskHoverEnter);
        container.removeEventListener('mouseout', handleTaskHoverLeave);
        containerHoverHandlersBound = false;
    }

    if (gridContent && gridHandlersBound) {
        gridContent.removeEventListener('dblclick', handleTimelineGridDoubleClick);
        gridContent.removeEventListener('click', handleTaskBarClick);
        gridContent.removeEventListener('contextmenu', handleTaskBarContextMenu);
        gridHandlersBound = false;
    }

    currentLanedTasks = [];
}

function setupTaskProgressControls(lanedTasks = []) {
    document.querySelectorAll('.task-progress-slider').forEach(slider => {
        if (slider.dataset.sample === 'true') {
            slider.setAttribute('disabled', 'disabled');
            return;
        }
        const taskId = slider.dataset.taskId;
        const row = slider.closest('.task-table-row');
        const fill = row?.querySelector('.task-progress-fill');
        const label = row?.querySelector('.task-progress-value');

        slider.addEventListener('input', (event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (fill) {
                fill.style.width = `${value}%`;
            }
            if (label) {
                label.textContent = `${value}%`;
            }
        });

        slider.addEventListener('change', async (event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (!taskId || Number.isNaN(value)) return;
            const success = await updateTaskProgress(taskId, value);
            if (success) {
                const task = lanedTasks.find(t => t.id === taskId);
                if (task) {
                    task.progress = value;
                }
                renderTimeline();
            }
        });
    });
}

function renderKeyDatesSkeleton() {
    return `
        <div class="flex flex-col gap-3">
            ${Array.from({ length: 3 }).map(() => `
                <div class="key-date-row-skeleton">
                    <div class="key-date-row-date"></div>
                    <div class="key-date-row-content"></div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderKeyDatesPanel(keyDates, context) {
    const listContainer = document.getElementById('timeline-key-dates-list');
    const countLabel = document.getElementById('timeline-key-dates-count');
    if (!listContainer) return;

    const renderData = getKeyDateRenderData(keyDates, context);
    timelineState.keyDates = keyDates;

    if (countLabel) {
        const periodLabel = getTimelinePeriodLabel(context);
        countLabel.textContent = renderData.length === 0
            ? `Sin hitos cargados para el ${periodLabel}.`
            : `${renderData.length} ${renderData.length === 1 ? 'hito planificado' : 'hitos planificados'} para el ${periodLabel}.`;
    }

    if (renderData.length === 0) {
        listContainer.innerHTML = `
            <div class="key-date-empty">
                <i data-lucide="map-pin" class="w-6 h-6"></i>
                <p class="key-date-empty-title">Todavía no cargaste fechas clave.</p>
                <p class="key-date-empty-subtitle">Agregá hitos importantes para seguirlos en el planning.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    listContainer.innerHTML = `
        <ul class="key-date-list">
            ${renderData.map(item => `
                <li class="key-date-item" data-key-date-id="${item.id}">
                    <div class="key-date-item-left">
                        <span class="key-date-item-date">${formatDisplayDate(item.date)}</span>
                        <div>
                            <p class="key-date-item-title">${item.title}</p>
                            ${item.description ? `<p class="key-date-item-description">${item.description}</p>` : ''}
                        </div>
                    </div>
                    <div class="key-date-item-actions">
                        <button class="key-date-delete-btn" data-key-date-id="${item.id}" title="Eliminar hito">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </li>
            `).join('')}
        </ul>
    `;

    document.querySelectorAll('.key-date-delete-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const keyDateId = event.currentTarget.dataset.keyDateId;
            if (!keyDateId) return;
            const confirmed = window.confirm('¿Eliminar esta fecha clave del planning?');
            if (!confirmed) return;
            const toastId = window.showToast('Eliminando fecha clave...', 'loading', { duration: 0 });
            try {
                await deleteDoc(doc(db, 'planning_key_dates', keyDateId));
                window.showToast('Fecha clave eliminada.', 'success', { toastId });
                renderTimeline();
            } catch (error) {
                console.error('Error removing key date:', error);
                window.showToast('No se pudo eliminar la fecha clave.', 'error', { toastId });
            }
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function formatDateForInput(value) {
    if (!value) return '';
    const parsed = parseDateOnly(value) || parseDateValue(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
}

function normalizeTaskForModal(task) {
    if (!task) return null;
    const startDate = formatDateForInput(task.startDate) || task.startDate || '';
    const dueSource = task.dueDate ?? task.endDate ?? null;
    const dueDate = formatDateForInput(dueSource) || dueSource || '';
    const endSource = task.endDate ?? task.dueDate ?? dueSource;
    const endDate = formatDateForInput(endSource) || endSource || '';
    return {
        ...task,
        docId: task.docId || task.id,
        startDate,
        dueDate,
        endDate
    };
}

function closeModalById(modalId) {
    const modal = document.getElementById(modalId);
    modal?.remove();
}

function openKeyDateModal(range) {
    if (!dom?.modalContainer) return;
    const modalId = `key-date-modal-${Date.now()}`;
    const defaultDate = range?.startDate || formatDateForInput(new Date());
    const minDate = range?.startDate || '';
    const maxDate = range?.endDate || '';

    dom.modalContainer.innerHTML = `
        <div id="${modalId}" class="timeline-modal-backdrop">
            <div class="timeline-modal">
                <div class="timeline-modal-header">
                    <div>
                        <h3 class="timeline-modal-title">Agregar fecha clave</h3>
                        <p class="timeline-modal-subtitle">Marcá hitos importantes para que se destaquen en el planning.</p>
                    </div>
                    <button class="timeline-modal-close" data-action="close" title="Cerrar">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
                <form id="${modalId}-form" class="timeline-modal-form">
                    <label class="timeline-modal-field">
                        <span>Título</span>
                        <input type="text" name="title" required maxlength="120" placeholder="Ej. Lanzamiento MVP" class="timeline-modal-input">
                    </label>
                    <label class="timeline-modal-field">
                        <span>Fecha</span>
                        <input type="date" name="date" required min="${minDate}" max="${maxDate}" value="${defaultDate}" class="timeline-modal-input">
                    </label>
                    <label class="timeline-modal-field">
                        <span>Descripción (opcional)</span>
                        <textarea name="description" rows="3" maxlength="240" placeholder="Notas para el equipo..." class="timeline-modal-textarea"></textarea>
                    </label>
                    <div class="timeline-modal-actions">
                        <button type="button" data-action="cancel" class="timeline-modal-btn secondary">Cancelar</button>
                        <button type="submit" class="timeline-modal-btn primary">Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const form = document.getElementById(`${modalId}-form`);
    if (!modalElement || !form) return;

    modalElement.addEventListener('click', (event) => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'close' || action === 'cancel') {
            closeModalById(modalId);
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const title = formData.get('title')?.toString().trim();
        const date = formData.get('date')?.toString();
        const description = formData.get('description')?.toString().trim();

        if (!title || !date) {
            window.showToast('Completá el título y la fecha para continuar.', 'error');
            return;
        }

        const toastId = window.showToast('Guardando fecha clave...', 'loading', { duration: 0 });
        try {
            const payload = {
                title,
                date,
                description,
                createdAt: new Date().toISOString(),
                createdBy: appState?.currentUser?.uid || null
            };
            await addDoc(collection(db, 'planning_key_dates'), payload);
            window.showToast('Fecha clave agregada.', 'success', { toastId });
            closeModalById(modalId);
            renderTimeline();
        } catch (error) {
            console.error('Error saving key date:', error);
            window.showToast('No se pudo guardar la fecha clave.', 'error', { toastId });
        }
    });
}

function renderAnnualSummary(tasks, year) {
    const container = document.getElementById('timeline-summary-content');
    const yearLabel = document.getElementById('timeline-summary-year-label');
    const countLabel = document.getElementById('timeline-summary-count');
    if (!container || !yearLabel) return;

    yearLabel.textContent = year.toString();

    if (!Array.isArray(tasks) || tasks.length === 0) {
        if (countLabel) {
            countLabel.textContent = 'No hay tareas con fechas asignadas.';
        }
        container.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Asigná fechas de inicio y fin para visualizar el planning ${year}.</p>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const tasksWithDates = tasks
        .map(task => {
            const schedule = task.schedule || {};
            const planStartDateObj = schedule.planStartDate ? new Date(schedule.planStartDate) : parseDateOnly(task.startDate);
            const planEndDateObj = schedule.planEndDate ? new Date(schedule.planEndDate) : getSafeDueDate(task.startDate, task.dueDate);
            const planStartISO = planStartDateObj ? planStartDateObj.toISOString().split('T')[0] : null;
            const planEndISO = planEndDateObj ? planEndDateObj.toISOString().split('T')[0] : null;
            return {
                ...task,
                schedule,
                planStartDateObj,
                planEndDateObj,
                planStartISO,
                planEndISO
            };
        })
        .filter(task => task.planStartDateObj && task.planEndDateObj && task.planEndDateObj >= task.planStartDateObj);

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const relevantTasks = tasksWithDates.filter(task => task.planEndDateObj >= yearStart && task.planStartDateObj <= yearEnd);

    const filteredByStatus = relevantTasks.filter(task => {
        if (timelineState.statusFilter === 'all') return true;
        return task.schedule?.state === timelineState.statusFilter;
    });
    const filteredTasks = filterTasksByAssignee(filteredByStatus, timelineState.assigneeFilter);
    if (countLabel) {
        const baseText = `${relevantTasks.length} tareas con planificación en ${year}.`;
        if (timelineState.statusFilter === 'all') {
            if (filteredTasks.length === relevantTasks.length && timelineState.assigneeFilter === 'all') {
                countLabel.textContent = baseText;
            } else if (timelineState.assigneeFilter !== 'all' && filteredTasks.length > 0) {
                countLabel.textContent = `${filteredTasks.length} coinciden con los filtros de estado y responsable.`;
            } else {
                countLabel.textContent = `${filteredTasks.length} de ${relevantTasks.length} coinciden con los filtros aplicados.`;
            }
        } else {
            const config = TASK_STATE_CONFIG[timelineState.statusFilter];
            if (config) {
                const label = config.label.toLowerCase();
                const plural = filteredTasks.length === 1 ? '' : 's';
                countLabel.textContent = `${filteredTasks.length} ${label}${plural} de ${relevantTasks.length} planificadas en ${year}.`;
            } else {
                countLabel.textContent = baseText;
            }
        }
    }

    if (filteredTasks.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">No hay tareas que coincidan con el filtro seleccionado para ${year}.</p>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const sortedTasks = filteredTasks.sort((a, b) => {
        if (a.planStartDateObj.getTime() === b.planStartDateObj.getTime()) {
            return (a.title || '').localeCompare(b.title || '');
        }
        return a.planStartDateObj - b.planStartDateObj;
    });

    const rowsHTML = sortedTasks.map(task => {
        const schedule = task.schedule || {};
        const stateDisplay = getTaskStateDisplay(schedule);
        const state = stateDisplay.state;
        const progressValue = Math.round(Number.isFinite(schedule.progressPercent) ? schedule.progressPercent : getTaskProgressValue(task));
        const plannedProgressRaw = Number.isFinite(schedule.plannedProgressPercent)
            ? schedule.plannedProgressPercent
            : Number.isFinite(schedule.plannedProgress)
                ? schedule.plannedProgress * 100
                : progressValue;
        const plannedProgressValue = Math.max(0, Math.min(100, Math.round(plannedProgressRaw)));
        const deltaPointsRaw = Number.isFinite(schedule.deltaPercentagePoints)
            ? schedule.deltaPercentagePoints
            : ((Number.isFinite(schedule.progressPercent) ? schedule.progressPercent : progressValue) - plannedProgressValue);
        const deltaLabel = `${formatSignedPoints(deltaPointsRaw)} pp`;
        const planProgressLabel = schedule.hasPlanRange ? `Plan ${plannedProgressValue}%` : 'Plan —';
        const stateChip = getTaskStateChipHTML(schedule, { tooltip: formatTaskScheduleTooltip(task, schedule), textType: 'chip' });
        const delayChip = state === TASK_STATE.DELAYED
            ? `<span class="summary-chip" data-task-state="${state}">Atraso ${(schedule.atrasoDias ?? 0)}d</span>`
            : '';
        const durationLabel = getTaskDurationLabel(task.planStartISO, task.planEndISO);
        return `
            <tr class="summary-row" data-task-state="${state}">
                <td class="summary-col-main">
                    <div class="summary-title-row">
                        <p class="summary-task-title" title="${escapeHTML(task.title || 'Tarea sin título')}">${escapeHTML(task.title || 'Tarea sin título')}</p>
                        ${stateChip}
                    </div>
                    <div class="summary-meta-row">
                        <span class="summary-chip">Inicio ${formatDisplayDate(task.planStartISO)}</span>
                        <span class="summary-chip">Fin ${formatDisplayDate(task.planEndISO)}</span>
                        <span class="summary-chip">${durationLabel}</span>
                        ${delayChip}
                    </div>
                </td>
                <td class="summary-col-progress">
                    <div class="summary-progress-bar" data-task-state="${state}">
                        <span class="task-plan-marker" style="left: ${plannedProgressValue}%;"></span>
                        <div class="summary-progress-fill" style="width: ${progressValue}%;"></div>
                    </div>
                    <div class="summary-progress-meta">
                        <span class="summary-plan-label">${planProgressLabel}</span>
                        <span class="summary-delta" data-task-state="${state}" title="Diferencia versus plan">Δ ${deltaLabel}</span>
                    </div>
                    <span class="summary-progress-value">${progressValue}%</span>
                </td>
            </tr>
        `;
    }).join('');

    const demoNote = timelineState.usingSampleData
        ? '<p class="summary-demo-note">Mostrando datos de ejemplo para visualizar el formato del planning.</p>'
        : '';

    container.innerHTML = `
        <table class="summary-table">
            <thead>
                <tr>
                    <th>Tarea</th>
                    <th>Avance</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
        ${demoNote}
    `;

    if (window.lucide) window.lucide.createIcons();
}

export function initTimelineModule(app) {
    db = app?.db || null;
    openTaskFormModalRef = typeof app?.openTaskFormModal === 'function' ? app.openTaskFormModal : null;
    showConfirmationModalRef = typeof app?.showConfirmationModal === 'function' ? app.showConfirmationModal : null;
    updateDocFn = typeof app?.updateDoc === 'function' ? app.updateDoc : firebaseUpdateDoc;
}

export function destroyTimelineModule() {
    detachTimelineInteractions();
    if (modalCloseObserver) {
        modalCloseObserver.disconnect();
        modalCloseObserver = null;
    }
    if (typeof unsubscribeTasks === 'function') {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    if (typeof unsubscribeKeyDates === 'function') {
        unsubscribeKeyDates();
        unsubscribeKeyDates = null;
    }
    openTaskFormModalRef = null;
    showConfirmationModalRef = null;
    updateDocFn = firebaseUpdateDoc;
    currentLanedTasks = [];
}

function updateTimelineDateLabel() {
    const label = document.getElementById('timeline-date-label');
    if (!label) return;
    const { zoomLevel, visibleDate } = timelineState;
    let labelText = '';
    if (zoomLevel === 'year') {
        labelText = String(visibleDate.getFullYear());
    } else if (zoomLevel === 'month') {
        labelText = `${MONTH_NAMES[visibleDate.getMonth()]} ${visibleDate.getFullYear()}`;
    } else if (zoomLevel === 'week') {
        labelText = getWeekRangeString(visibleDate);
    }
    label.textContent = labelText;
    const button = document.getElementById('timeline-date-button');
    if (button && labelText) {
        button.setAttribute('aria-label', `Cambiar el período del planning a ${labelText}`);
    }
}

function updateZoomButtons() {
    const { zoomLevel } = timelineState;
    document.querySelectorAll('.zoom-controls .timeline-zoom-btn').forEach(btn => {
        if (btn.dataset.zoom === zoomLevel) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

async function populateTimelinePeriod() {
    const taskList = document.querySelector('.timeline-task-list');
    const timescale = document.querySelector('.timeline-timescale');
    const gridContent = document.querySelector('.timeline-grid-content');
    const { zoomLevel, visibleDate } = timelineState;
    const timeContext = { zoomLevel, visibleDate };
    if (!taskList || !timescale || !gridContent) {
        return;
    }

    taskList.innerHTML = `<div class="timeline-loading"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Cargando tareas...</span></div>`;
    timescale.innerHTML = '';
    gridContent.innerHTML = `<div class="timeline-loading vertical"><i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i><span>Cargando planning...</span></div>`;
    if (window.lucide) window.lucide.createIcons();

    destroyTimelineModule();

    const range = getPeriodRange(zoomLevel, visibleDate);
    timelineState.currentRange = range;
    timelineState.keyDates = [];

    let latestTasks = [];
    let latestKeyDates = [];

    return new Promise((resolve) => {
        let initialResolved = false;

        const completeInitialRender = () => {
            if (!initialResolved) {
                initialResolved = true;
                resolve();
            }
        };

        const updateView = async () => {
            const displayTasks = latestTasks.length > 0 ? latestTasks : buildSamplePlanningTasks(range);
            timelineState.usingSampleData = latestTasks.length === 0;
            timelineState.lastFetchedTasks = displayTasks;
            timelineState.keyDates = latestKeyDates;

            const assigneeOptions = getAssigneeOptions(displayTasks);
            const availableFilters = new Set(assigneeOptions.map(option => option.value));
            if (timelineState.assigneeFilter !== 'all' && !availableFilters.has(timelineState.assigneeFilter)) {
                timelineState.assigneeFilter = 'all';
            }

            const filteredTasks = filterTasksByAssignee(displayTasks, timelineState.assigneeFilter);
            const { lanedTasks, totalLanes } = assignLanesToTasks(filteredTasks, timeContext);

            const optionsMarkup = renderAssigneeSelectOptions(assigneeOptions, timelineState.assigneeFilter);
            const totalCount = displayTasks.length;
            const filteredCount = filteredTasks.length;
            const countLabel = timelineState.assigneeFilter === 'all'
                ? filteredCount
                : `${filteredCount} de ${totalCount}`;
            const demoPill = timelineState.usingSampleData
                ? '<span class="task-demo-pill subtle">Vista previa con datos de ejemplo</span>'
                : '';
            const legendStateChips = TASK_STATE_SEQUENCE.map(stateKey => {
                const sampleSchedule = stateKey === TASK_STATE.DELAYED
                    ? { state: stateKey, atrasoDias: 3 }
                    : { state: stateKey };
                return getTaskStateChipHTML(sampleSchedule, { textType: 'label' });
            }).join('');
            const legendPlanChip = `
                <span class="legend-chip legend-chip-plan">
                    <span class="legend-chip-bar" data-task-state="${TASK_STATE.ON_TIME}">
                        <span class="task-plan-marker" style="left: 65%;"></span>
                        <span class="task-bar-progress" style="width: 45%;"></span>
                    </span>
                    <span class="legend-chip-label">Plan vs avance</span>
                </span>
            `;
            const legendSampleChip = `
                <span class="legend-chip legend-chip-sample">
                    <span class="legend-sample-pill">Demo</span>
                    <span class="legend-chip-label">Tarea de ejemplo</span>
                </span>
            `;

            taskList.innerHTML = `
                <div class="timeline-task-list-inner">
                    <div class="timeline-task-list-header">
                        <div class="task-header-top">
                            <div class="task-header-info">
                                <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300">Tareas (${countLabel})</h3>
                                <div class="task-list-legend">
                                    <span class="task-list-legend-text">Arrastrá para mover · Estirá los extremos para ajustar fechas</span>
                                    <div class="task-status-legend" aria-hidden="true">
                                        ${legendStateChips}
                                        ${legendPlanChip}
                                        ${legendSampleChip}
                                    </div>
                                </div>
                            </div>
                            <div class="task-header-actions">
                                <button type="button" data-action="timeline-add-task" class="timeline-add-task-btn inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                    <i data-lucide="plus" class="w-4 h-4"></i>
                                    <span>+ Tarea</span>
                                </button>
                                ${demoPill}
                                <label class="task-filter">
                                    <span>Responsable</span>
                                    <select id="timeline-assignee-filter" class="task-filter-select">${optionsMarkup}</select>
                                </label>
                            </div>
                        </div>
                        <div class="task-table-head">
                            <span>Trabajo</span>
                            <span>Inicio</span>
                            <span>Fin</span>
                            <span>Plazo / Avance</span>
                        </div>
                    </div>
                    <div class="timeline-task-list-body">${getTaskListHTML(lanedTasks, timeContext)}</div>
                </div>
            `;

            const addTaskButton = taskList.querySelector('[data-action="timeline-add-task"]');
            if (addTaskButton) {
                addTaskButton.addEventListener('click', () => {
                    const defaultDate = range?.startDate || formatDateForInput(new Date());
                    void openTaskModal(null, {
                        status: 'todo',
                        assigneeUid: null,
                        startDate: defaultDate,
                        dueDate: defaultDate
                    });
                });
            }

            timescale.innerHTML = getTimelineScaleHTML(zoomLevel, visibleDate) + getKeyDateTrackHTML(latestKeyDates, timeContext);
            gridContent.innerHTML = getGridLinesHTML(zoomLevel, visibleDate) + getKeyDateMarkersHTML(latestKeyDates, timeContext) + getTaskBarsHTML(lanedTasks, timeContext);

            const lanes = Math.max(totalLanes, 1);
            const laneHeight = TASK_BAR_HEIGHT + TASK_BAR_GAP;
            gridContent.style.minHeight = `${lanes * laneHeight + TASK_BAR_GAP * 2}px`;

            let minWidth = '1400px';
            if (zoomLevel === 'year') {
                const totalDays = isLeapYear(visibleDate.getFullYear()) ? 366 : 365;
                minWidth = `${Math.max(totalDays * YEAR_DAY_COLUMN_MIN_WIDTH, 1600)}px`;
            } else if (zoomLevel === 'month') {
                const daysInMonth = new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 1, 0).getDate();
                minWidth = `${Math.max(daysInMonth * MONTH_DAY_COLUMN_MIN_WIDTH, 960)}px`;
            } else if (zoomLevel === 'week') {
                minWidth = `${Math.max(7 * WEEK_DAY_COLUMN_MIN_WIDTH, 980)}px`;
            }
            gridContent.style.minWidth = minWidth;
            const scaleContent = timescale.querySelector('.timescale-day-track, .timescale-month-track, .timescale-week-track');
            if (scaleContent) {
                scaleContent.style.minWidth = minWidth;
            }

            setupTimelineInteractions(lanedTasks, timeContext);
            setupTaskProgressControls(lanedTasks);
            attachAssigneeFilterListener();

            if (window.lucide) window.lucide.createIcons();

            await updateTimelineSummary(displayTasks);
            updateTimelineInsights(lanedTasks, timeContext);
            renderKeyDatesPanel(latestKeyDates, timeContext);

            completeInitialRender();
        };

        const tasksUnsubscriber = subscribeTimelineTasks(range, (tasks) => {
            latestTasks = Array.isArray(tasks) ? tasks : [];
            void updateView();
        });

        const keyDatesUnsubscriber = subscribePlanningKeyDates(range, (keyDatesData) => {
            latestKeyDates = Array.isArray(keyDatesData) ? keyDatesData : [];
            void updateView();
        });

        if (!tasksUnsubscriber || !keyDatesUnsubscriber) {
            void updateView();
        }
    });
}

function updateTimelineInsights(tasks = [], context = timelineState) {
    const container = document.getElementById('timeline-insights');
    if (!container) return;

    if (!Array.isArray(tasks) || tasks.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300/70 dark:border-slate-600/50 bg-white/70 dark:bg-slate-900/40 p-6 text-center">
                <i data-lucide="calendar-x" class="w-8 h-8 text-slate-400"></i>
                <div>
                    <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">Sin tareas programadas</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Asigná fechas para ver indicadores del ${getTimelinePeriodLabel(context)}.</p>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const total = tasks.length;
    const doneCount = tasks.filter(task => task.status === 'done').length;
    const inProgressCount = tasks.filter(task => task.status === 'inprogress').length;
    const todoCount = tasks.filter(task => task.status !== 'done' && task.status !== 'inprogress').length;
    const overdueTasks = tasks.filter(task => (task.schedule?.state ?? TASK_STATE.ON_TIME) === TASK_STATE.DELAYED);
    const overdueCount = overdueTasks.length;
    const maxDelay = overdueTasks.reduce((acc, task) => Math.max(acc, task.schedule?.atrasoDias ?? 0), 0);
    const averageProgress = Math.round(tasks.reduce((acc, task) => {
        if (Number.isFinite(task.schedule?.progressPercent)) {
            return acc + task.schedule.progressPercent;
        }
        return acc + getTaskProgressValue(task);
    }, 0) / total);
    const completionRate = Math.round((doneCount / total) * 100);
    const periodLabel = getTimelinePeriodLabel(context);

    container.innerHTML = `
        <div class="timeline-insight-card">
            <div class="timeline-insight-header">
                <div>
                    <p class="timeline-insight-label">Programadas</p>
                    <p class="timeline-insight-value">${total}</p>
                </div>
                <span class="timeline-insight-icon bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"><i data-lucide="calendar-range" class="w-5 h-5"></i></span>
            </div>
            <p class="timeline-insight-hint">${total === 1 ? '1 tarea' : `${total} tareas`} con fechas dentro del ${periodLabel}.</p>
        </div>
        <div class="timeline-insight-card">
            <div class="timeline-insight-header">
                <div>
                    <p class="timeline-insight-label">Avance general</p>
                    <p class="timeline-insight-value">${averageProgress}%</p>
                </div>
                <span class="timeline-insight-icon bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"><i data-lucide="trending-up" class="w-5 h-5"></i></span>
            </div>
            <div class="mt-3 space-y-2">
                <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div class="h-2 rounded-full bg-emerald-500" style="width: ${averageProgress}%;"></div>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">${doneCount} completadas (${completionRate}%).</p>
            </div>
        </div>
        <div class="timeline-insight-card">
            <div class="timeline-insight-header">
                <div>
                    <p class="timeline-insight-label">En curso</p>
                    <p class="timeline-insight-value">${inProgressCount}</p>
                </div>
                <span class="timeline-insight-icon bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"><i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i></span>
            </div>
            <p class="timeline-insight-hint">${todoCount} pendientes esperan iniciar.</p>
        </div>
        <div class="timeline-insight-card timeline-insight-card--alert">
            <div class="timeline-insight-header">
                <div>
                    <p class="timeline-insight-label">Atrasadas</p>
                    <p class="timeline-insight-value">${overdueCount}</p>
                </div>
                <span class="timeline-insight-icon bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"><i data-lucide="alert-octagon" class="w-5 h-5"></i></span>
            </div>
            <p class="timeline-insight-hint">${overdueCount === 0 ? 'Todo el plan está al día.' : `Mayor atraso: ${maxDelay} ${maxDelay === 1 ? 'día' : 'días'}.`}</p>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
}

async function updateTimelineSummary(periodTasks = []) {
    const container = document.getElementById('timeline-summary-content');
    if (!container) return;
    container.innerHTML = `<div class="timeline-loading"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Actualizando resumen...</span></div>`;
    if (window.lucide) window.lucide.createIcons();

    const { summaryYear, zoomLevel, visibleDate } = timelineState;
    let summaryTasks;
    if (zoomLevel === 'year' && Array.isArray(periodTasks) && visibleDate.getFullYear() === summaryYear) {
        summaryTasks = periodTasks;
    } else {
        summaryTasks = await fetchSummaryTasks(summaryYear);
    }
    if (timelineState.usingSampleData && (!Array.isArray(summaryTasks) || summaryTasks.length === 0)) {
        if (timelineState.summaryYear !== new Date(timelineState.currentRange?.startDate || `${timelineState.summaryYear}-01-01`).getFullYear()) {
            const sampleRange = { startDate: `${timelineState.summaryYear}-01-01`, endDate: `${timelineState.summaryYear}-12-31` };
            summaryTasks = buildSamplePlanningTasks(sampleRange);
        } else {
            summaryTasks = timelineState.lastFetchedTasks || [];
        }
    }
    renderAnnualSummary(summaryTasks, summaryYear);
}

async function renderTimeline() {
    if (typeof timelineState.summaryYear !== 'number') {
        timelineState.summaryYear = timelineState.visibleDate.getFullYear();
    }

    const rangeForInput = getPeriodRange(timelineState.zoomLevel, timelineState.visibleDate);
    const activeDateValue = rangeForInput?.startDate ?? new Date().toISOString().split('T')[0];

    const statusOptions = SUMMARY_STATUS_FILTERS
        .map(filter => `<option value="${filter.value}" ${timelineState.statusFilter === filter.value ? 'selected' : ''}>${filter.label}</option>`)
        .join('');

    dom.viewContent.innerHTML = `
        <style>
            .timeline-page { display: flex; flex-direction: column; gap: 1.5rem; }
            #timeline-insights { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
            .timeline-insight-card { border-radius: 1.5rem; border: 1px solid rgba(148,163,184,0.35); background: rgba(255,255,255,0.92); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; box-shadow: 0 18px 34px -28px rgba(15,23,42,0.55); transition: transform 0.2s ease, box-shadow 0.2s ease; }
            .timeline-insight-card:hover { transform: translateY(-2px); box-shadow: 0 18px 40px -28px rgba(15,23,42,0.6); }
            .dark .timeline-insight-card { background: rgba(15,23,42,0.78); border-color: rgba(71,85,105,0.45); box-shadow: 0 18px 36px -28px rgba(15,23,42,0.85); }
            .timeline-insight-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
            .timeline-insight-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(71,85,105,0.85); }
            .dark .timeline-insight-label { color: rgba(148,163,184,0.85); }
            .timeline-insight-value { font-size: 1.875rem; font-weight: 700; color: rgb(15,23,42); }
            .dark .timeline-insight-value { color: rgb(226,232,240); }
            .timeline-insight-icon { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0.5rem; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6); }
            .dark .timeline-insight-icon { box-shadow: inset 0 0 0 1px rgba(15,23,42,0.6); }
            .timeline-insight-hint { font-size: 0.75rem; color: rgba(71,85,105,0.9); }
            .dark .timeline-insight-hint { color: rgba(148,163,184,0.85); }
            .timeline-insight-card--alert { border-color: rgba(244,63,94,0.35); background: rgba(254,226,226,0.7); }
            .timeline-insight-card--alert:hover { box-shadow: 0 20px 40px -28px rgba(190,18,60,0.55); }
            .dark .timeline-insight-card--alert { border-color: rgba(251,113,133,0.45); background: rgba(136,19,55,0.45); }
            .timeline-date-picker { display: flex; align-items: center; gap: 0.5rem; }
            .timeline-date-button { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 999px; padding: 0.35rem 0.85rem; background: rgba(255,255,255,0.88); border: 1px solid rgba(148,163,184,0.35); color: rgba(30,41,59,0.88); font-size: 0.85rem; font-weight: 600; letter-spacing: 0.04em; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .timeline-date-button:hover { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 3px rgba(59,130,246,0.18); }
            .timeline-date-button span { min-width: 5rem; text-align: center; }
            .dark .timeline-date-button { background: rgba(30,41,59,0.85); color: rgba(226,232,240,0.9); border-color: rgba(71,85,105,0.55); }
            .dark .timeline-date-button:hover { border-color: rgba(96,165,250,0.6); box-shadow: 0 0 0 3px rgba(96,165,250,0.22); }
            .timeline-date-input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
            .timeline-container { display: grid; grid-template-columns: minmax(640px, 760px) minmax(640px, 1fr); background: linear-gradient(135deg, rgba(248,250,252,0.9), rgba(226,232,240,0.75)); border-radius: 1.5rem; overflow: hidden; }
            .dark .timeline-container { background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.88)); }
            .timeline-task-list { position: relative; overflow-y: auto; max-height: 480px; min-width: 640px; width: 100%; }
            .timeline-task-list-inner { min-height: 100%; min-width: 640px; width: 100%; }
            .timeline-task-list-header { position: sticky; top: 0; z-index: 3; padding: 0.85rem 1.25rem; background: rgba(255,255,255,0.94); border-bottom: 1px solid rgba(148,163,184,0.18); backdrop-filter: blur(6px); display: flex; flex-direction: column; gap: 0.65rem; }
            .dark .timeline-task-list-header { background: rgba(15,23,42,0.92); border-bottom-color: rgba(71,85,105,0.4); }
            .task-list-legend { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.625rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; color: rgba(71,85,105,0.7); }
            .dark .task-list-legend { color: rgba(148,163,184,0.7); }
            .task-list-legend-text { line-height: 1.3; }
            .task-status-legend { display: flex; flex-wrap: wrap; gap: 0.45rem 0.65rem; align-items: center; }
            .legend-chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.55rem 0.2rem 0.4rem; border-radius: 999px; background: rgba(226,232,240,0.55); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; color: rgba(71,85,105,0.78); }
            .legend-chip .task-state-chip { margin: 0; }
            .dark .legend-chip { background: rgba(51,65,85,0.7); color: rgba(203,213,225,0.82); }
            .legend-chip-plan { display: inline-flex; align-items: center; gap: 0.5rem; }
            .legend-chip-sample { display: inline-flex; align-items: center; gap: 0.5rem; }
            .legend-chip-bar { position: relative; display: inline-flex; align-items: center; justify-content: flex-start; width: 44px; height: 12px; border-radius: 999px; background: rgba(226,232,240,0.85); border: 1px dashed rgba(148,163,184,0.4); overflow: hidden; }
            .dark .legend-chip-bar { background: rgba(30,41,59,0.82); border-color: rgba(71,85,105,0.45); }
            .legend-chip-bar .task-bar-progress { position: absolute; inset: 0; border-radius: inherit; width: 45%; }
            .legend-chip-bar[data-task-state="completed"] { background: rgba(209,250,229,0.6); border-style: solid; border-color: rgba(16,185,129,0.45); }
            .dark .legend-chip-bar[data-task-state="completed"] { background: rgba(6,78,59,0.55); border-color: rgba(16,185,129,0.55); }
            .legend-chip-bar[data-task-state="on_time"] { background: rgba(191,219,254,0.65); border-style: solid; border-color: rgba(37,99,235,0.45); }
            .dark .legend-chip-bar[data-task-state="on_time"] { background: rgba(30,64,175,0.5); border-color: rgba(59,130,246,0.55); }
            .legend-chip-bar[data-task-state="at_risk"] { background: rgba(253,230,138,0.65); border-style: solid; border-color: rgba(217,119,6,0.45); }
            .dark .legend-chip-bar[data-task-state="at_risk"] { background: rgba(133,77,14,0.55); border-color: rgba(217,119,6,0.55); }
            .legend-chip-bar[data-task-state="delayed"] { background: rgba(254,226,226,0.7); border-style: solid; border-color: rgba(220,38,38,0.5); }
            .dark .legend-chip-bar[data-task-state="delayed"] { background: rgba(127,29,29,0.6); border-color: rgba(220,38,38,0.6); }
            .legend-sample-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 14px; border-radius: 999px; border: 1px dashed rgba(148,163,184,0.55); background: rgba(148,163,184,0.25); font-weight: 700; font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 0 0.35rem; }
            .dark .legend-sample-pill { border-color: rgba(148,163,184,0.45); background: rgba(71,85,105,0.4); }
            .legend-chip-label { white-space: nowrap; }
            .timeline-task-list-body { padding: 0.9rem 1.15rem 1.15rem; display: flex; flex-direction: column; gap: 0.45rem; }
            .task-header-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.85rem; }
            .task-header-info { display: flex; flex-direction: column; gap: 0.35rem; }
            .task-header-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; }
            .task-filter { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(71,85,105,0.7); }
            .dark .task-filter { color: rgba(148,163,184,0.7); }
            .task-filter-select { min-width: 140px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.45); background: rgba(255,255,255,0.92); padding: 0.35rem 0.75rem; font-size: 0.75rem; color: rgba(30,41,59,0.88); outline: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .task-filter-select:focus { border-color: rgba(59,130,246,0.6); box-shadow: 0 0 0 3px rgba(59,130,246,0.18); }
            .dark .task-filter-select { background: rgba(30,41,59,0.85); border-color: rgba(71,85,105,0.6); color: rgba(226,232,240,0.9); }
            .task-demo-pill { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.58rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; background: rgba(59,130,246,0.12); color: rgba(37,99,235,0.85); border: 1px solid transparent; }
            .task-demo-pill.subtle { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.35); color: rgba(30,64,175,0.75); }
            .dark .task-demo-pill { background: rgba(37,99,235,0.25); color: rgba(191,219,254,0.85); }
            .dark .task-demo-pill.subtle { background: rgba(30,64,175,0.35); border-color: rgba(96,165,250,0.45); }
            .task-table-head { display: grid; grid-template-columns: minmax(200px, 2fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(220px, 1.5fr); gap: 0.6rem; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(71,85,105,0.7); }
            .task-table-head span:nth-child(2),
            .task-table-head span:nth-child(3) { text-align: center; }
            .task-table-head span:nth-child(4) { text-align: right; }
            .dark .task-table-head { color: rgba(148,163,184,0.75); }
            .task-table-row { display: grid; grid-template-columns: minmax(200px, 2fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(220px, 1.5fr); align-items: stretch; gap: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 0.75rem; border: 1px solid rgba(148,163,184,0.2); background: rgba(255,255,255,0.78); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .task-table-row:hover { border-color: rgba(59,130,246,0.35); box-shadow: 0 10px 20px -20px rgba(59,130,246,0.45); }
            .task-table-row.highlight { border-color: rgba(59,130,246,0.55); box-shadow: 0 0 0 2px rgba(59,130,246,0.25); }
            .task-table-row.sample { border-style: dashed; }
            .dark .task-table-row { background: rgba(15,23,42,0.78); border-color: rgba(71,85,105,0.45); }
            .dark .task-table-row:hover { border-color: rgba(96,165,250,0.5); box-shadow: 0 12px 26px -24px rgba(37,99,235,0.45); }
            .task-col { display: flex; flex-direction: column; justify-content: center; gap: 0.25rem; min-width: 0; }
            .task-col--main { justify-content: flex-start; gap: 0.35rem; }
            .task-col--date { align-items: center; justify-content: center; text-align: center; gap: 0.2rem; }
            .task-col--progress { align-items: stretch; justify-content: center; gap: 0.45rem; text-align: right; }
            .task-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.4rem; }
            .task-title { font-size: 0.78rem; font-weight: 600; color: rgb(30,41,59); line-height: 1.3; }
            .dark .task-title { color: rgb(226,232,240); }
            .task-title { overflow-wrap: anywhere; }
            .task-meta-line { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.64rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(71,85,105,0.75); }
            .dark .task-meta-line { color: rgba(148,163,184,0.75); }
            .task-date-range { font-weight: 700; white-space: nowrap; }
            .task-date-value { font-size: 0.74rem; font-weight: 600; color: rgba(30,41,59,0.9); white-space: nowrap; }
            .dark .task-date-value { color: rgba(226,232,240,0.85); }
            .task-date-year { font-size: 0.6rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(71,85,105,0.7); }
            .dark .task-date-year { color: rgba(148,163,184,0.7); }
            .task-duration { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(71,85,105,0.75); }
            .dark .task-duration { color: rgba(148,163,184,0.75); }
            .task-progress-display { display: flex; align-items: center; gap: 0.55rem; }
            .task-progress-bar { flex: 1; height: 0.4rem; border-radius: 999px; background: rgba(226,232,240,0.75); overflow: hidden; position: relative; }
            .dark .task-progress-bar { background: rgba(51,65,85,0.85); }
            .task-table-row[data-task-state="completed"] .task-progress-bar { background: rgba(209,250,229,0.55); border: 1px solid rgba(16,185,129,0.35); }
            .dark .task-table-row[data-task-state="completed"] .task-progress-bar { background: rgba(6,78,59,0.6); border-color: rgba(16,185,129,0.45); }
            .task-table-row[data-task-state="on_time"] .task-progress-bar { background: rgba(191,219,254,0.55); border: 1px solid rgba(37,99,235,0.35); }
            .dark .task-table-row[data-task-state="on_time"] .task-progress-bar { background: rgba(30,64,175,0.5); border-color: rgba(59,130,246,0.45); }
            .task-table-row[data-task-state="at_risk"] .task-progress-bar { background: rgba(253,230,138,0.55); border: 1px solid rgba(217,119,6,0.4); }
            .dark .task-table-row[data-task-state="at_risk"] .task-progress-bar { background: rgba(133,77,14,0.55); border-color: rgba(217,119,6,0.5); }
            .task-table-row[data-task-state="delayed"] .task-progress-bar { background: rgba(254,226,226,0.6); border: 1px solid rgba(220,38,38,0.45); }
            .dark .task-table-row[data-task-state="delayed"] .task-progress-bar { background: rgba(127,29,29,0.55); border-color: rgba(220,38,38,0.55); }
            .task-progress-fill { position: absolute; inset: 0; width: 0; transition: width 0.35s ease; border-radius: inherit; }
            .task-progress-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.45rem; row-gap: 0.3rem; }
            .task-plan-progress-label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(71,85,105,0.72); min-width: 72px; }
            .dark .task-plan-progress-label { color: rgba(148,163,184,0.75); }
            .task-progress-slider { -webkit-appearance: none; appearance: none; height: 2px; flex: 1; min-width: 0; border-radius: 999px; background: linear-gradient(90deg, rgba(59,130,246,0.85), rgba(56,189,248,0.85)); outline: none; cursor: pointer; transition: filter 0.2s ease; }
            .task-progress-slider:hover { filter: brightness(1.08); }
            .task-progress-slider:disabled { cursor: not-allowed; opacity: 0.6; }
            .task-progress-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid rgba(59,130,246,0.9); box-shadow: 0 4px 10px -6px rgba(59,130,246,0.6); }
            .task-progress-slider::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid rgba(59,130,246,0.9); box-shadow: 0 4px 10px -6px rgba(59,130,246,0.6); }
            .task-progress-value { font-size: 0.64rem; font-weight: 700; min-width: 2.4rem; text-align: right; letter-spacing: 0.04em; flex-shrink: 0; color: rgba(37,99,235,0.9); }
            .dark .task-progress-value { color: rgba(191,219,254,0.9); }
            .task-table-row[data-task-state="completed"] .task-progress-value { color: rgba(5,122,85,0.95); }
            .dark .task-table-row[data-task-state="completed"] .task-progress-value { color: rgba(167,243,208,0.95); }
            .task-table-row[data-task-state="at_risk"] .task-progress-value { color: rgba(217,119,6,0.95); }
            .dark .task-table-row[data-task-state="at_risk"] .task-progress-value { color: rgba(253,224,71,0.95); }
            .task-table-row[data-task-state="delayed"] .task-progress-value { color: rgba(185,28,28,0.95); }
            .dark .task-table-row[data-task-state="delayed"] .task-progress-value { color: rgba(254,202,202,0.95); }
            .task-progress-controls .task-duration { white-space: nowrap; }
            .summary-table { width: 100%; min-width: 620px; border-collapse: separate; border-spacing: 0; }
            .summary-table thead { background: rgba(241,245,249,0.85); }
            .dark .summary-table thead { background: rgba(30,41,59,0.82); }
            .summary-table th { text-align: left; padding: 0.75rem 0.75rem 0.65rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(71,85,105,0.8); }
            .summary-table th:last-child { text-align: right; }
            .dark .summary-table th { color: rgba(203,213,225,0.82); }
            .summary-table tbody { background: transparent; }
            .summary-row { border-bottom: 1px solid rgba(148,163,184,0.25); transition: background 0.2s ease; }
            .summary-row:last-child { border-bottom: none; }
            .summary-row:hover { background: rgba(59,130,246,0.08); }
            .dark .summary-row:hover { background: rgba(37,99,235,0.18); }
            .summary-col-main { padding: 0.75rem 0.5rem 0.75rem 0; }
            .summary-col-progress { padding: 0.75rem 0 0.75rem 0.5rem; width: 180px; text-align: right; }
            .summary-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
            .summary-task-title { font-size: 0.82rem; font-weight: 600; color: rgb(30,41,59); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .dark .summary-task-title { color: rgb(226,232,240); }
            .summary-meta-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
            .summary-chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 999px; background: rgba(241,245,249,0.9); color: rgba(71,85,105,0.82); text-transform: uppercase; letter-spacing: 0.06em; }
            .dark .summary-chip { background: rgba(51,65,85,0.78); color: rgba(203,213,225,0.85); }
            .summary-chip[data-task-state="delayed"] { background: rgba(254,226,226,0.92); color: rgba(185,28,28,0.95); }
            .dark .summary-chip[data-task-state="delayed"] { background: rgba(127,29,29,0.7); color: rgba(254,226,226,0.95); }
            .summary-progress-bar { position: relative; height: 0.45rem; border-radius: 999px; background: rgba(226,232,240,0.8); overflow: hidden; box-shadow: inset 0 2px 4px -2px rgba(15,23,42,0.4); margin-bottom: 0.35rem; }
            .dark .summary-progress-bar { background: rgba(51,65,85,0.85); box-shadow: inset 0 2px 4px -2px rgba(15,23,42,0.7); }
            .summary-progress-bar[data-task-state="completed"] { background: rgba(209,250,229,0.55); box-shadow: inset 0 2px 4px -2px rgba(4,120,87,0.35); border: 1px solid rgba(16,185,129,0.35); }
            .dark .summary-progress-bar[data-task-state="completed"] { background: rgba(6,78,59,0.55); border-color: rgba(16,185,129,0.45); box-shadow: inset 0 2px 4px -2px rgba(5,150,105,0.45); }
            .summary-progress-bar[data-task-state="on_time"] { background: rgba(191,219,254,0.55); border: 1px solid rgba(37,99,235,0.35); box-shadow: inset 0 2px 4px -2px rgba(37,99,235,0.35); }
            .dark .summary-progress-bar[data-task-state="on_time"] { background: rgba(30,64,175,0.45); border-color: rgba(59,130,246,0.45); box-shadow: inset 0 2px 4px -2px rgba(59,130,246,0.45); }
            .summary-progress-bar[data-task-state="at_risk"] { background: rgba(253,230,138,0.55); border: 1px solid rgba(217,119,6,0.4); box-shadow: inset 0 2px 4px -2px rgba(217,119,6,0.45); }
            .dark .summary-progress-bar[data-task-state="at_risk"] { background: rgba(133,77,14,0.55); border-color: rgba(217,119,6,0.55); box-shadow: inset 0 2px 4px -2px rgba(217,119,6,0.55); }
            .summary-progress-bar[data-task-state="delayed"] { background: rgba(254,226,226,0.6); border: 1px solid rgba(220,38,38,0.45); box-shadow: inset 0 2px 4px -2px rgba(220,38,38,0.45); }
            .dark .summary-progress-bar[data-task-state="delayed"] { background: rgba(127,29,29,0.55); border-color: rgba(220,38,38,0.6); box-shadow: inset 0 2px 4px -2px rgba(225,29,72,0.5); }
            .summary-progress-fill { position: absolute; inset: 0; border-radius: inherit; }
            .summary-progress-meta { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(71,85,105,0.75); margin-bottom: 0.35rem; }
            .dark .summary-progress-meta { color: rgba(148,163,184,0.75); }
            .summary-plan-label { font-weight: 700; }
            .summary-delta { font-weight: 700; }
            .summary-delta[data-task-state="on_time"] { color: rgba(37,99,235,0.95); }
            .summary-delta[data-task-state="at_risk"] { color: rgba(217,119,6,0.95); }
            .summary-delta[data-task-state="delayed"] { color: rgba(185,28,28,0.95); }
            .summary-progress-value { font-size: 0.7rem; font-weight: 700; color: rgba(37,99,235,0.9); }
            .dark .summary-progress-value { color: rgba(191,219,254,0.9); }
            .summary-demo-note { margin-top: 0.75rem; font-size: 0.7rem; font-style: italic; color: rgba(71,85,105,0.75); }
            .dark .summary-demo-note { color: rgba(148,163,184,0.7); }
            .timeline-main { position: relative; display: flex; flex-direction: column; min-height: 320px; }
            .timeline-timescale { position: sticky; top: 0; z-index: 2; background: rgba(248,250,252,0.95); backdrop-filter: blur(6px); padding: 1rem 1.5rem; border-bottom: 1px solid rgba(148,163,184,0.2); display: flex; flex-direction: column; gap: 0.65rem; }
            .dark .timeline-timescale { background: rgba(15,23,42,0.92); border-bottom-color: rgba(71,85,105,0.4); }
            .timescale-year-row { position: sticky; top: 0; left: 50%; transform: translateX(-50%); display: flex; justify-content: center; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(71,85,105,0.85); z-index: 2; pointer-events: none; background: inherit; padding-bottom: 0.25rem; }
            .timescale-year-chip { display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.85rem; border-radius: 999px; background: rgba(241,245,249,0.85); box-shadow: inset 0 0 0 1px rgba(148,163,184,0.25); margin: 0 auto; pointer-events: auto; }
            .dark .timescale-year-row { color: rgba(226,232,240,0.85); }
            .dark .timescale-year-chip { background: rgba(30,41,59,0.8); box-shadow: inset 0 0 0 1px rgba(71,85,105,0.4); }
            .timescale-month-track { display: grid; border-radius: 0.75rem; overflow: hidden; border: 1px solid rgba(148,163,184,0.3); background: rgba(226,232,240,0.65); }
            .dark .timescale-month-track { border-color: rgba(71,85,105,0.5); background: rgba(30,41,59,0.8); }
            .timescale-month-segment { display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: rgba(71,85,105,0.85); position: relative; padding: 0.35rem 0; }
            .timescale-month-segment:not(:last-child)::after { content: ''; position: absolute; top: 18%; right: 0; width: 1px; height: 64%; background: rgba(148,163,184,0.35); }
            .dark .timescale-month-segment { color: rgba(226,232,240,0.85); }
            .dark .timescale-month-segment:not(:last-child)::after { background: rgba(71,85,105,0.6); }
            .timescale-week-track { display: grid; gap: 0.5rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(71,85,105,0.8); }
            .dark .timescale-week-track { color: rgba(148,163,184,0.85); }
            .timescale-week { display: flex; align-items: center; justify-content: center; padding: 0.35rem 0.25rem; border-radius: 0.5rem; background: rgba(226,232,240,0.55); }
            .dark .timescale-week { background: rgba(30,41,59,0.75); }
            .timescale-day-track { display: grid; gap: 0; align-items: end; }
            .timescale-day { display: flex; flex-direction: column; gap: 0.15rem; align-items: center; justify-content: flex-end; font-size: 0.7rem; color: rgba(71,85,105,0.85); }
            .timescale-day-name { font-size: 0.65rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(71,85,105,0.75); }
            .timescale-day-number { font-weight: 700; letter-spacing: 0.02em; }
            .dark .timescale-day, .dark .timescale-day-name, .dark .timescale-day-number { color: rgba(226,232,240,0.85); }
            .timescale-day-tick { position: relative; display: flex; align-items: flex-end; justify-content: center; height: 22px; font-size: 0.55rem; color: rgba(148,163,184,0.65); }
            .timescale-day-tick::after { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 1px; height: 12px; background: rgba(148,163,184,0.45); }
            .timescale-day-tick.labeled { color: rgba(59,130,246,0.85); font-weight: 700; }
            .timescale-day-tick.labeled::after { height: 18px; background: rgba(59,130,246,0.7); }
            .dark .timescale-day-tick { color: rgba(148,163,184,0.6); }
            .dark .timescale-day-tick::after { background: rgba(71,85,105,0.55); }
            .dark .timescale-day-tick.labeled { color: rgba(191,219,254,0.85); }
            .dark .timescale-day-tick.labeled::after { background: rgba(96,165,250,0.75); }
            .timeline-grid { position: relative; flex: 1; overflow: auto; background: linear-gradient(180deg, rgba(148,163,184,0.12), rgba(148,163,184,0.05)); }
            .dark .timeline-grid { background: linear-gradient(180deg, rgba(30,41,59,0.6), rgba(15,23,42,0.55)); }
            .timeline-grid-content { position: relative; min-height: 240px; padding: 24px 0; }
            .timeline-grid-content .grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(148,163,184,0.45); }
            .dark .timeline-grid-content .grid-line { background: rgba(71,85,105,0.55); }
            .timeline-grid-content .today-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(59,130,246,0.9); }
            .dark .timeline-grid-content .today-marker { background: rgba(96,165,250,0.9); }
            .timeline-grid-content .today-marker .today-label { position: absolute; top: 8px; left: 6px; font-size: 10px; background: rgba(59,130,246,0.95); color: #fff; padding: 2px 6px; border-radius: 999px; box-shadow: 0 8px 14px -8px rgba(59,130,246,0.45); }
            .dark .timeline-grid-content .today-marker .today-label { background: rgba(96,165,250,0.95); }
            .timeline-grid-content .task-bar { position: absolute; height: 22px; border-radius: 11px; display: flex; align-items: center; justify-content: center; padding: 0 10px; cursor: grab; font-weight: 600; color: rgba(30,41,59,0.92); background: rgba(226,232,240,0.9); border: 1px solid rgba(148,163,184,0.45); box-shadow: 0 12px 24px -18px rgba(148,163,184,0.65); transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
            .dark .timeline-grid-content .task-bar { background: rgba(30,41,59,0.85); border-color: rgba(71,85,105,0.6); color: rgba(226,232,240,0.9); box-shadow: 0 12px 24px -18px rgba(15,23,42,0.75); }
            .timeline-grid-content .task-bar.sample { background: linear-gradient(135deg, rgba(148,163,184,0.65), rgba(100,116,139,0.55)); color: rgba(15,23,42,0.85); cursor: default; box-shadow: 0 10px 22px -18px rgba(15,23,42,0.4); border: 1px dashed rgba(148,163,184,0.5); }
            .dark .timeline-grid-content .task-bar.sample { color: rgba(226,232,240,0.85); border-color: rgba(148,163,184,0.45); background: linear-gradient(135deg, rgba(71,85,105,0.75), rgba(51,65,85,0.65)); }
            .timeline-grid-content .task-bar.sample:hover { filter: none; box-shadow: 0 10px 22px -18px rgba(15,23,42,0.4); }
            .timeline-grid-content .task-bar:hover { box-shadow: 0 14px 30px -18px rgba(30,64,175,0.75); filter: brightness(1.05); }
            .timeline-grid-content .task-bar.highlight { box-shadow: 0 0 0 3px rgba(59,130,246,0.4), 0 14px 32px -18px rgba(30,64,175,0.7); filter: saturate(1.15); }
            .timeline-grid-content .task-bar[data-task-state="completed"] { background: rgba(209,250,229,0.75); border-color: rgba(16,185,129,0.55); color: rgba(4,120,87,0.95); box-shadow: 0 14px 28px -18px rgba(5,150,105,0.5); }
            .dark .timeline-grid-content .task-bar[data-task-state="completed"] { background: rgba(6,78,59,0.6); border-color: rgba(16,185,129,0.6); color: rgba(209,250,229,0.95); box-shadow: 0 14px 28px -18px rgba(16,185,129,0.45); }
            .timeline-grid-content .task-bar[data-task-state="on_time"] { background: rgba(191,219,254,0.75); border-color: rgba(37,99,235,0.55); color: rgba(29,78,216,0.95); box-shadow: 0 14px 30px -18px rgba(30,64,175,0.55); }
            .dark .timeline-grid-content .task-bar[data-task-state="on_time"] { background: rgba(30,64,175,0.55); border-color: rgba(59,130,246,0.55); color: rgba(191,219,254,0.95); box-shadow: 0 14px 30px -18px rgba(30,64,175,0.65); }
            .timeline-grid-content .task-bar[data-task-state="at_risk"] { background: rgba(253,230,138,0.75); border-color: rgba(217,119,6,0.55); color: rgba(180,83,9,0.95); box-shadow: 0 14px 30px -18px rgba(217,119,6,0.55); }
            .dark .timeline-grid-content .task-bar[data-task-state="at_risk"] { background: rgba(133,77,14,0.6); border-color: rgba(217,119,6,0.6); color: rgba(253,224,71,0.95); box-shadow: 0 14px 30px -18px rgba(217,119,6,0.65); }
            .timeline-grid-content .task-bar[data-task-state="delayed"] { background: rgba(254,226,226,0.78); border-color: rgba(220,38,38,0.6); color: rgba(185,28,28,0.98); box-shadow: 0 14px 32px -18px rgba(190,18,60,0.6); }
            .dark .timeline-grid-content .task-bar[data-task-state="delayed"] { background: rgba(127,29,29,0.65); border-color: rgba(220,38,38,0.65); color: rgba(254,226,226,0.98); box-shadow: 0 16px 32px -18px rgba(225,29,72,0.65); }
            .timeline-grid-content .task-bar-progress { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; z-index: 1; }
            .timeline-grid-content .task-bar-label { position: relative; z-index: 3; font-size: 0.72rem; letter-spacing: 0.01em; white-space: nowrap; pointer-events: none; }
            .timeline-grid-content .task-bar-alert { position: absolute; top: -18px; right: 16px; }
            .timeline-loading { display: flex; align-items: center; justify-content: center; gap: 0.75rem; color: rgba(100,116,139,1); font-size: 0.875rem; padding: 1.5rem; }
            .timeline-loading.vertical { flex-direction: column; min-height: 220px; }
            .dark .timeline-loading { color: rgba(148,163,184,0.85); }
            .timeline-nav-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 12px; background: rgba(226,232,240,0.65); color: rgb(71,85,105); transition: all 0.2s ease; }
            .timeline-nav-btn:hover { background: rgba(59,130,246,0.18); color: rgb(37,99,235); }
            .dark .timeline-nav-btn { background: rgba(30,41,59,0.85); color: rgba(148,163,184,0.9); }
            .dark .timeline-nav-btn:hover { background: rgba(96,165,250,0.18); color: rgba(191,219,254,1); }
            .timeline-zoom-btn { color: rgb(71,85,105); transition: all 0.2s ease; }
            .timeline-zoom-btn.active { background: linear-gradient(135deg, rgba(59,130,246,1), rgba(56,189,248,0.95)); color: #fff; box-shadow: 0 12px 28px -18px rgba(59,130,246,0.65); }
            .dark .timeline-zoom-btn { color: rgba(226,232,240,0.85); }
            .timeline-task-list::-webkit-scrollbar, .timeline-grid::-webkit-scrollbar { width: 8px; height: 8px; }
            .timeline-task-list::-webkit-scrollbar-thumb, .timeline-grid::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.5); border-radius: 999px; }
            .dark .timeline-task-list::-webkit-scrollbar-thumb, .dark .timeline-grid::-webkit-scrollbar-thumb { background: rgba(71,85,105,0.6); }
            .timescale-keydates-row { position: relative; padding-top: 0.55rem; margin-top: 0.35rem; }
            .timescale-keydates-row::before { content: ''; position: absolute; top: 0; left: 0; right: 0; border-top: 1px dashed rgba(148,163,184,0.35); }
            .dark .timescale-keydates-row::before { border-top-color: rgba(71,85,105,0.55); }
            .timescale-keydates-track { position: relative; height: 36px; }
            .timescale-keydates-item { position: absolute; top: 6px; transform: translateX(-50%); display: flex; align-items: center; gap: 0.45rem; max-width: 220px; }
            .timescale-keydates-dot { width: 8px; height: 8px; border-radius: 999px; background: rgba(245,158,11,0.95); box-shadow: 0 6px 12px -8px rgba(217,119,6,0.7); }
            .timescale-keydates-label { display: flex; flex-direction: column; gap: 2px; background: rgba(255,255,255,0.96); border-radius: 0.65rem; padding: 0.35rem 0.6rem; border: 1px solid rgba(251,191,36,0.55); box-shadow: 0 10px 24px -20px rgba(15,23,42,0.55); }
            .dark .timescale-keydates-label { background: rgba(15,23,42,0.92); border-color: rgba(217,119,6,0.55); box-shadow: 0 12px 24px -20px rgba(15,23,42,0.85); }
            .timescale-keydates-label-date { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(217,119,6,0.95); }
            .dark .timescale-keydates-label-date { color: rgba(253,224,71,0.9); }
            .timescale-keydates-label-text { font-size: 0.75rem; font-weight: 600; color: rgba(30,41,59,0.95); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .dark .timescale-keydates-label-text { color: rgba(226,232,240,0.95); }
            .timescale-keydates-row.empty { padding: 0.75rem 0 0.25rem; }
            .timescale-keydates-empty { font-size: 0.75rem; font-style: italic; color: rgba(100,116,139,0.85); }
            .dark .timescale-keydates-empty { color: rgba(148,163,184,0.8); }
            .key-date-marker { position: absolute; top: 8px; bottom: 8px; width: 0; pointer-events: none; z-index: 2; }
            .key-date-marker-line { position: absolute; top: 0; bottom: 12px; width: 2px; background: rgba(251,191,36,0.85); transform: translateX(-1px); }
            .key-date-marker-dot { position: absolute; bottom: 0; width: 8px; height: 8px; border-radius: 999px; background: rgba(245,158,11,0.95); transform: translate(-4px, 0); box-shadow: 0 4px 10px -6px rgba(217,119,6,0.75); }
            .dark .key-date-marker-line { background: rgba(217,119,6,0.7); }
            .dark .key-date-marker-dot { background: rgba(253,224,71,0.9); box-shadow: 0 4px 10px -6px rgba(217,119,6,0.6); }
            .timeline-key-dates-card { position: relative; overflow: hidden; }
            .timeline-key-dates-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 120% at 0% 0%, rgba(254,243,199,0.25), transparent 60%); pointer-events: none; }
            .dark .timeline-key-dates-card::before { background: radial-gradient(120% 120% at 0% 0%, rgba(120,53,15,0.25), transparent 60%); }
            .key-date-list { display: flex; flex-direction: column; gap: 0.75rem; position: relative; z-index: 1; }
            .key-date-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.65rem; padding: 0.6rem 0.85rem; border-radius: 0.65rem; border: 1px solid rgba(226,232,240,0.65); background: rgba(255,255,255,0.92); box-shadow: 0 10px 22px -24px rgba(15,23,42,0.45); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .key-date-item:hover { border-color: rgba(251,191,36,0.65); box-shadow: 0 14px 28px -22px rgba(217,119,6,0.55); }
            .dark .key-date-item { background: rgba(15,23,42,0.88); border-color: rgba(71,85,105,0.55); box-shadow: 0 14px 30px -26px rgba(15,23,42,0.9); }
            .dark .key-date-item:hover { border-color: rgba(253,224,71,0.65); box-shadow: 0 16px 32px -24px rgba(217,119,6,0.55); }
            .key-date-item-left { display: flex; align-items: flex-start; gap: 0.75rem; }
            .key-date-item-date { display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.6rem; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 999px; background: rgba(254,215,170,0.6); color: rgba(217,119,6,0.95); }
            .dark .key-date-item-date { background: rgba(120,53,15,0.5); color: rgba(253,224,71,0.9); }
            .key-date-item-title { font-size: 0.9rem; font-weight: 600; color: rgb(30,41,59); }
            .dark .key-date-item-title { color: rgb(226,232,240); }
            .key-date-item-description { font-size: 0.75rem; color: rgba(71,85,105,0.85); margin-top: 0.2rem; }
            .dark .key-date-item-description { color: rgba(148,163,184,0.8); }
            .key-date-item-actions { display: flex; align-items: center; gap: 0.4rem; }
            .key-date-delete-btn { border: none; background: rgba(248,250,252,0.92); border-radius: 999px; padding: 0.35rem; color: rgba(100,116,139,0.85); cursor: pointer; transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease; }
            .key-date-delete-btn:hover { background: rgba(254,215,170,0.85); color: rgba(180,83,9,0.95); transform: translateY(-1px); }
            .dark .key-date-delete-btn { background: rgba(30,41,59,0.85); color: rgba(148,163,184,0.85); }
            .dark .key-date-delete-btn:hover { background: rgba(120,53,15,0.55); color: rgba(253,224,71,0.9); }
            .key-date-empty { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem; padding: 1.6rem 1rem; border: 1px dashed rgba(226,232,240,0.7); border-radius: 1rem; background: rgba(255,255,255,0.88); color: rgba(100,116,139,0.85); }
            .key-date-empty-title { font-weight: 600; font-size: 0.92rem; }
            .key-date-empty-subtitle { font-size: 0.75rem; color: rgba(100,116,139,0.75); text-align: center; }
            .dark .key-date-empty { background: rgba(15,23,42,0.85); border-color: rgba(71,85,105,0.55); color: rgba(148,163,184,0.85); }
            .dark .key-date-empty-subtitle { color: rgba(148,163,184,0.7); }
            .key-date-row-skeleton { display: flex; align-items: center; gap: 0.75rem; padding: 0.45rem 0; }
            .key-date-row-date, .key-date-row-content { border-radius: 999px; background: rgba(226,232,240,0.65); animation: timelinePulse 1.6s ease-in-out infinite; }
            .key-date-row-date { width: 68px; height: 0.85rem; }
            .key-date-row-content { flex: 1; height: 0.85rem; }
            .dark .key-date-row-date, .dark .key-date-row-content { background: rgba(51,65,85,0.75); }
            @keyframes timelinePulse { from { opacity: 0.45; } to { opacity: 0.95; } }
            .timeline-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; z-index: 60; backdrop-filter: blur(2px); }
            .timeline-modal { background: #fff; border-radius: 1rem; width: 100%; max-width: 420px; box-shadow: 0 28px 48px -32px rgba(15,23,42,0.55); overflow: hidden; }
            .dark .timeline-modal { background: rgba(15,23,42,0.96); box-shadow: 0 28px 48px -32px rgba(15,23,42,0.8); }
            .timeline-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1.5rem 1.5rem 1rem; }
            .timeline-modal-title { font-size: 1.125rem; font-weight: 700; color: rgb(30,41,59); }
            .dark .timeline-modal-title { color: rgb(226,232,240); }
            .timeline-modal-subtitle { font-size: 0.85rem; color: rgba(71,85,105,0.85); margin-top: 0.25rem; }
            .dark .timeline-modal-subtitle { color: rgba(148,163,184,0.8); }
            .timeline-modal-close { border: none; border-radius: 999px; background: transparent; color: rgba(71,85,105,0.6); padding: 0.35rem; cursor: pointer; transition: background 0.2s ease, color 0.2s ease; }
            .timeline-modal-close:hover { background: rgba(226,232,240,0.85); color: rgba(37,99,235,0.9); }
            .dark .timeline-modal-close { color: rgba(148,163,184,0.7); }
            .dark .timeline-modal-close:hover { background: rgba(51,65,85,0.6); color: rgba(191,219,254,0.9); }
            .timeline-modal-form { display: flex; flex-direction: column; gap: 1rem; padding: 0 1.5rem 1.5rem; }
            .timeline-modal-field { display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.85rem; color: rgba(71,85,105,0.9); }
            .dark .timeline-modal-field { color: rgba(226,232,240,0.85); }
            .timeline-modal-input, .timeline-modal-textarea { width: 100%; border-radius: 0.75rem; border: 1px solid rgba(148,163,184,0.45); background: rgba(255,255,255,0.95); padding: 0.55rem 0.75rem; font-size: 0.9rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .timeline-modal-input:focus, .timeline-modal-textarea:focus { outline: none; border-color: rgba(59,130,246,0.6); box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
            .dark .timeline-modal-input, .dark .timeline-modal-textarea { background: rgba(15,23,42,0.92); border-color: rgba(71,85,105,0.6); color: rgba(226,232,240,0.95); }
            .timeline-modal-textarea { resize: vertical; min-height: 96px; }
            .timeline-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; padding-top: 0.5rem; }
            .timeline-modal-btn { border-radius: 999px; font-weight: 600; padding: 0.6rem 1.4rem; cursor: pointer; border: none; transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease; }
            .timeline-modal-btn.secondary { background: rgba(226,232,240,0.85); color: rgba(71,85,105,0.9); }
            .timeline-modal-btn.secondary:hover { background: rgba(209,213,219,0.9); }
            .timeline-modal-btn.primary { background: linear-gradient(135deg, rgba(249,115,22,0.95), rgba(245,158,11,0.95)); color: #fff; box-shadow: 0 16px 30px -22px rgba(217,119,6,0.65); }
            .timeline-modal-btn.primary:hover { box-shadow: 0 18px 34px -20px rgba(217,119,6,0.7); filter: brightness(1.02); }
            .dark .timeline-modal-btn.secondary { background: rgba(51,65,85,0.85); color: rgba(226,232,240,0.85); }
            .dark .timeline-modal-btn.secondary:hover { background: rgba(71,85,105,0.85); }
        </style>
        <div class="timeline-page animate-fade-in-up">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i data-lucide="calendar-range" class="w-6 h-6 text-blue-500"></i>
                        Planning maestro
                    </h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Visualizá y ajustá tus tareas a lo largo del tiempo con cabeceras anuales detalladas, control de progreso y arrastre para recalcular el plan.</p>
                </div>
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                    <div class="zoom-controls inline-flex items-center gap-2 bg-slate-200 dark:bg-slate-800 rounded-full p-1">
                        <button data-zoom="year" class="timeline-zoom-btn px-4 py-1.5 text-sm font-semibold rounded-full">Año</button>
                        <button data-zoom="month" class="timeline-zoom-btn px-4 py-1.5 text-sm font-semibold rounded-full">Mes</button>
                        <button data-zoom="week" class="timeline-zoom-btn px-4 py-1.5 text-sm font-semibold rounded-full">Semana</button>
                    </div>
                    <div class="timeline-date-picker">
                        <button id="timeline-date-button" class="timeline-date-button" type="button">
                            <i data-lucide="calendar" class="w-4 h-4"></i>
                            <span id="timeline-date-label" class="text-base font-semibold"></span>
                        </button>
                        <input id="timeline-date-input" type="date" class="timeline-date-input" value="${activeDateValue}" aria-label="Elegir fecha para el planning" />
                    </div>
                </div>
            </div>
            <div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/60 shadow-sm overflow-hidden">
                <div class="timeline-container">
                    <aside class="timeline-task-list"></aside>
                    <section class="timeline-main">
                        <div class="timeline-timescale"></div>
                        <div class="timeline-grid">
                            <div class="timeline-grid-content"></div>
                        </div>
                    </section>
                </div>
            </div>
            <section class="timeline-key-dates-card border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/70 rounded-2xl shadow-sm p-6">
                <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <i data-lucide="map-pin" class="w-5 h-5 text-amber-500"></i>
                            Fechas clave del planning
                        </h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Marcá hitos y revisalos sobre la línea de tiempo.</p>
                        <p id="timeline-key-dates-count" class="text-xs text-slate-500 dark:text-slate-400"></p>
                    </div>
                    <button id="timeline-add-key-date" class="inline-flex items-center gap-2 rounded-full bg-amber-500 text-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-amber-600 transition">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                        Agregar fecha clave
                    </button>
                </div>
                <div id="timeline-key-dates-list" class="mt-4">
                    ${renderKeyDatesSkeleton()}
                </div>
            </section>
            <section id="timeline-insights">
                ${renderInsightsSkeleton()}
            </section>
            <section class="timeline-summary-card border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/70 rounded-2xl shadow-sm p-6">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div class="space-y-1">
                        <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-500"></i>
                            Planning anual
                        </h3>
                        <p class="text-sm text-slate-500 dark:text-slate-400">Compará el plan previsto con el avance real por tarea.</p>
                        <p id="timeline-summary-count" class="text-xs text-slate-500 dark:text-slate-400"></p>
                    </div>
                    <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                        <div class="inline-flex items-center gap-2 bg-slate-200 dark:bg-slate-800 rounded-full p-1">
                            <button id="timeline-summary-prev-year" class="timeline-nav-btn !rounded-full"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
                            <span id="timeline-summary-year-label" class="w-20 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">${timelineState.summaryYear}</span>
                            <button id="timeline-summary-next-year" class="timeline-nav-btn !rounded-full"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                        </div>
                        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            Estado
                            <select id="timeline-status-filter" class="min-w-[140px] rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">${statusOptions}</select>
                        </label>
                    </div>
                </div>
                <div class="mt-3 inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/50 px-3 py-1 rounded-full">
                    <i data-lucide="info" class="w-4 h-4"></i>
                    <span>Las barras azules muestran el plan, las verdes reflejan el progreso real.</span>
                </div>
                <div id="timeline-summary-content" class="mt-5 overflow-x-auto"></div>
            </section>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const dateInput = document.getElementById('timeline-date-input');
    const dateButton = document.getElementById('timeline-date-button');
    if (dateButton && dateInput) {
        const openPicker = () => {
            if (typeof dateInput.showPicker === 'function') {
                dateInput.showPicker();
            } else {
                dateInput.focus();
            }
        };
        dateButton.addEventListener('click', openPicker);
        dateButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker();
            }
        });
    }

    dateInput?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) return;
        const selected = new Date(value);
        if (Number.isNaN(selected.getTime())) return;
        selected.setHours(0, 0, 0, 0);
        timelineState.visibleDate = selected;
        timelineState.summaryYear = selected.getFullYear();
        renderTimeline();
    });

    document.querySelectorAll('.timeline-zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!btn.dataset.zoom) return;
            timelineState.zoomLevel = btn.dataset.zoom;
            timelineState.summaryYear = timelineState.visibleDate.getFullYear();
            renderTimeline();
        });
    });

    document.getElementById('timeline-summary-prev-year')?.addEventListener('click', async () => {
        timelineState.summaryYear -= 1;
        await updateTimelineSummary();
    });

    document.getElementById('timeline-summary-next-year')?.addEventListener('click', async () => {
        timelineState.summaryYear += 1;
        await updateTimelineSummary();
    });

    document.getElementById('timeline-status-filter')?.addEventListener('change', async (event) => {
        timelineState.statusFilter = event.target.value;
        await updateTimelineSummary();
    });

    document.getElementById('timeline-add-key-date')?.addEventListener('click', () => {
        const range = getPeriodRange(timelineState.zoomLevel, timelineState.visibleDate);
        openKeyDateModal(range);
    });

    updateZoomButtons();
    updateTimelineDateLabel();

    await populateTimelinePeriod();
}

export function runTimelineLogic() {
    destroyTimelineModule();
    appState.currentViewCleanup = destroyTimelineModule;
    timelineState.visibleDate = new Date();
    timelineState.zoomLevel = 'year';
    timelineState.summaryYear = timelineState.visibleDate.getFullYear();
    timelineState.statusFilter = timelineState.statusFilter || 'all';
    renderTimeline();
}

export {
    assignLanesToTasks,
    getTaskDurationLabel,
    getTaskDateRangeLabel,
    taskOverlapsRange,
    MIN_BAR_DURATION_DAYS,
    getSafeDueDate,
    getSafeDueDateISO
};

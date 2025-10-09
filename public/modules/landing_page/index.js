/**
 * Landing page (weekly planner) module.
 *
 * Coordinates the weekly planner rendering, backlog summaries, and AI-assisted
 * task generation for the authenticated user. All heavy dependencies are
 * injected by the application shell to keep the module decoupled from global
 * state.
 *
 * @module modules/landing_page/index
 */

import { collection, getDocs, query, where, orderBy, limit, doc, updateDoc, or } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../../utils.js';
import { getPlannerHelpModalHTML, getTasksModalHTML } from '../tasks/task.templates.js';
import { completeAndArchiveTask, updateTaskBlockedStatus, updateTaskStatus } from '../tasks/task.service.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";


// --- 1. DEPENDENCIES AND STATE ---
let db;
let appState;
let dom;
let lucide;
let showToast;
let functions;
let writeBatch;
let openTaskFormModal;
let openAIAssistantModal;

const onAITasksUpdated = () => {
    showToast('El planificador se está actualizando...', 'info');
    refreshWeeklyTasksView();
};

const getActiveRole = () => {
    if (!appState?.currentUser) return null;
    if (appState.previewRole) return appState.previewRole;
    if (appState.currentUser.isSuperAdmin) return 'admin';
    return appState.currentUser.role;
};

let weeklyTasksCache = [];
let columnTasksMap = new Map();

const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

let monthlyViewState = {
    months: [],
    monthlyTasksByKey: new Map(),
    selectedMonthKey: null,
    selectedWeekIndex: null,
    yearOffset: 0,
    viewPhase: 'months'
};

let monthWeekBucketsCache = new Map();
let isPlannerTransitioning = false;
const dailyViewState = {
    selectedDate: getLocalISODate()
};

// --- 2. UI RENDERING ---

function getWeekInfo(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset * 7);

    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

    const monthName = MONTH_NAMES[date.getMonth()];

    return {
        weekNumber,
        monthName,
        year: date.getFullYear()
    };
}

function renderLandingPageHTML() {
    dom.viewContent.innerHTML = `
        <div id="landing-page-container" class="animate-fade-in-up">
            <div class="grid grid-cols-1 gap-6 mb-8">
                <div class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm">
                    <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-4">
                        <div class="flex items-center gap-2">
                             <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Planificador de Tareas</h3>
                             <button id="show-planner-help-btn" class="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="Ayuda sobre el planificador">
                                 <i data-lucide="help-circle" class="w-5 h-5"></i>
                             </button>
                        </div>
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-1">
                            <div class="flex flex-wrap items-center gap-3">
                                <div id="week-display" class="font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full"></div>
                                <div id="planner-view-toggle" class="inline-flex rounded-full bg-slate-200 dark:bg-slate-700 p-1">
                                    <button data-view-mode="weekly" class="planner-toggle-btn px-4 py-1.5 text-sm font-semibold rounded-full transition-colors">Semanal</button>
                                    <button data-view-mode="daily" class="planner-toggle-btn px-4 py-1.5 text-sm font-semibold rounded-full transition-colors">Diaria</button>
                                    <button data-view-mode="monthly" class="planner-toggle-btn px-4 py-1.5 text-sm font-semibold rounded-full transition-colors">Mensual</button>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                                 <button id="prev-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Semana Anterior"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                                 <button id="today-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Volver a Hoy"><i data-lucide="calendar-check-2" class="w-5 h-5"></i></button>
                                <button id="next-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Siguiente Semana"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                                <button id="ai-assistant-btn" class="relative group bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-5 py-2.5 rounded-full hover:shadow-lg hover:shadow-purple-500/50 flex items-center shadow-md transition-all duration-300 transform hover:scale-105">
                                    <span class="absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></span>
                                    <span class="relative flex items-center">
                                        <i data-lucide="bot" class="mr-2 h-5 w-5"></i>Asistente de IA
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="weekly-view-container">
                         <div id="priority-legend" class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-6 border-t border-b border-slate-200 dark:border-slate-700 py-2">
                            <span class="font-bold">Prioridad:</span>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span>Alta</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-yellow-500"></span>Media</div>
                            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-500"></span>Baja</div>
                        </div>
                        <div id="weekly-tasks-container" class="grid grid-cols-1 lg:grid-cols-7 gap-6 min-h-[400px]"></div>
                    </div>
                    <div id="daily-view-container" class="hidden">
                        <div class="space-y-6">
                            <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <h4 class="text-lg font-semibold text-slate-700 dark:text-slate-200">Planificación diaria</h4>
                                    <p id="daily-date-label" class="text-sm text-slate-500 dark:text-slate-400"></p>
                                </div>
                                <div class="flex flex-wrap items-center gap-3">
                                    <div class="inline-flex rounded-full bg-slate-200 dark:bg-slate-700 p-1">
                                        <button id="daily-prev-day-btn" class="px-3 py-1.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200" title="Día anterior"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
                                        <button id="daily-today-btn" class="px-4 py-1.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200" title="Volver a Hoy">Hoy</button>
                                        <button id="daily-next-day-btn" class="px-3 py-1.5 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200" title="Día siguiente"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                                    </div>
                                    <input type="date" id="daily-date-picker" class="px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                                <div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 p-5 shadow-sm flex flex-col justify-between gap-4">
                                    <div class="flex items-center justify-between">
                                        <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">Grado de avance</p>
                                        <span id="daily-progress-percentage" class="text-lg font-bold text-emerald-600 dark:text-emerald-400">0%</span>
                                    </div>
                                    <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div id="daily-progress-bar" class="h-3 bg-emerald-500 rounded-full transition-all duration-300" style="width: 0%"></div>
                                    </div>
                                    <div class="space-y-1">
                                        <p id="daily-progress-summary" class="text-xs text-slate-500 dark:text-slate-400">No hay tareas planificadas.</p>
                                        <p class="text-[11px] text-slate-400 dark:text-slate-500">Arrastrá las tareas entre columnas para actualizar su estado diario.</p>
                                    </div>
                                </div>
                                <div class="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4" id="daily-columns-container">
                                    <div class="daily-column rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 p-4" data-status="todo">
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                <i data-lucide="list-todo" class="w-4 h-4 text-yellow-500"></i>
                                                <span class="text-sm font-semibold">Por hacer</span>
                                            </div>
                                            <span id="daily-count-todo" class="text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">0</span>
                                        </div>
                                        <div class="daily-task-list space-y-2 min-h-[220px]" data-status="todo" id="daily-list-todo"></div>
                                    </div>
                                    <div class="daily-column rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 p-4" data-status="inprogress">
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                <i data-lucide="timer" class="w-4 h-4 text-blue-500"></i>
                                                <span class="text-sm font-semibold">En progreso</span>
                                            </div>
                                            <span id="daily-count-inprogress" class="text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">0</span>
                                        </div>
                                        <div class="daily-task-list space-y-2 min-h-[220px]" data-status="inprogress" id="daily-list-inprogress"></div>
                                    </div>
                                    <div class="daily-column rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 p-4" data-status="done">
                                        <div class="flex items-center justify-between mb-3">
                                            <div class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
                                                <span class="text-sm font-semibold">Completadas</span>
                                            </div>
                                            <span id="daily-count-done" class="text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">0</span>
                                        </div>
                                        <div class="daily-task-list space-y-2 min-h-[220px]" data-status="done" id="daily-list-done"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="monthly-view-container" class="hidden">
                        <div class="space-y-6">
                            <div class="flex flex-col gap-3">
                                <div class="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h4 class="text-lg font-semibold text-slate-700 dark:text-slate-200">Planificación mensual</h4>
                                        <p class="text-sm text-slate-500 dark:text-slate-400">Elegí un mes para visualizar sus semanas y profundizar en las tareas planificadas.</p>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button id="monthly-prev-year-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Año anterior">
                                            <i data-lucide="chevron-left" class="w-4 h-4"></i>
                                        </button>
                                        <span id="monthly-year-label" class="text-sm font-semibold text-slate-700 dark:text-slate-200"></span>
                                        <button id="monthly-next-year-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Próximo año">
                                            <i data-lucide="chevron-right" class="w-4 h-4"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div id="monthly-months-section" class="monthly-section">
                                <div id="monthly-months-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"></div>
                            </div>
                            <div id="monthly-weeks-section" class="monthly-section hidden space-y-4">
                                <div class="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 px-4 py-3 shadow-sm">
                                    <button type="button" data-action="monthly-back-to-months" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
                                        <i data-lucide="arrow-left" class="w-4 h-4"></i>
                                        Volver atrás
                                    </button>
                                    <div class="text-right">
                                        <p id="monthly-selected-month-title" class="text-base font-semibold text-slate-700 dark:text-slate-200"></p>
                                        <p id="monthly-selected-month-total" class="text-xs text-slate-500 dark:text-slate-400"></p>
                                    </div>
                                </div>
                                <div id="monthly-week-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"></div>
                            </div>
                            <div id="monthly-tasks-section" class="monthly-section hidden space-y-4">
                                <div class="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 px-4 py-3 shadow-sm">
                                    <button type="button" data-action="monthly-back-to-weeks" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors">
                                        <i data-lucide="arrow-left" class="w-4 h-4"></i>
                                        Volver atrás
                                    </button>
                                    <div class="text-right">
                                        <p id="monthly-selected-week-title" class="text-base font-semibold text-slate-700 dark:text-slate-200"></p>
                                        <p id="monthly-selected-week-total" class="text-xs text-slate-500 dark:text-slate-400"></p>
                                    </div>
                                </div>
                                <div id="monthly-week-tasks" class="space-y-2"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div id="overdue-tasks-container" class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <h4 class="font-bold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2"><i data-lucide="alert-triangle"></i>Tareas Vencidas</h4>
                    <div class="task-list space-y-1 h-64 overflow-y-auto custom-scrollbar" data-column-type="overdue"></div>
                 </div>
                 <div id="unscheduled-tasks-container" class="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                    <h4 class="font-bold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-2"><i data-lucide="calendar-x"></i>Tareas sin fecha programada</h4>
                    <div class="task-list space-y-1 h-64 overflow-y-auto custom-scrollbar" data-column-type="unscheduled"></div>
                 </div>
                 <div id="blocked-tasks-container" class="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-lg">
                    <h4 class="font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><i data-lucide="lock"></i>Tareas Bloqueadas</h4>
                    <div class="task-list space-y-1 h-64 overflow-y-auto custom-scrollbar" data-column-type="blocked"></div>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

function getWeekDateRange(returnFullWeek = false) {
    const today = new Date();
    today.setDate(today.getDate() + (appState.weekOffset * 7));
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    if (returnFullWeek) {
        return Array.from({ length: 5 }).map((_, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return date.toISOString().split('T')[0];
        });
    }
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4 + (2 * 7));
    friday.setHours(23, 59, 59, 999);
    const format = (date) => date.toISOString().split('T')[0];
    return { start: format(monday), end: format(friday) };
}

function getLocalISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDailyDateLabel(dateString) {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    const label = date.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function updateDailyDateUI() {
    const labelElement = document.getElementById('daily-date-label');
    const picker = document.getElementById('daily-date-picker');
    if (labelElement) {
        labelElement.textContent = getDailyDateLabel(dailyViewState.selectedDate);
    }
    if (picker && picker.value !== dailyViewState.selectedDate) {
        picker.value = dailyViewState.selectedDate;
    }
}

function setDailyViewDate(newDate) {
    if (!newDate) return;
    dailyViewState.selectedDate = newDate;
    updateDailyDateUI();
    renderDailyView(weeklyTasksCache);
}

function adjustDailyViewDate(offsetDays) {
    const baseDate = new Date(`${dailyViewState.selectedDate}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
        setDailyViewDate(getLocalISODate());
        return;
    }
    baseDate.setDate(baseDate.getDate() + offsetDays);
    setDailyViewDate(getLocalISODate(baseDate));
}

function sortTasksForDailyColumn(tasks = []) {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => {
        const priorityDiff = (priorityOrder[a.priority || 'medium'] ?? 1) - (priorityOrder[b.priority || 'medium'] ?? 1);
        if (priorityDiff !== 0) return priorityDiff;
        if (a.dueDate && b.dueDate) {
            return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return (a.title || '').localeCompare(b.title || '');
    });
}

const DAILY_STATUS_CONFIG = [
    { key: 'todo', listId: 'daily-list-todo', countId: 'daily-count-todo', label: 'Por hacer' },
    { key: 'inprogress', listId: 'daily-list-inprogress', countId: 'daily-count-inprogress', label: 'En progreso' },
    { key: 'done', listId: 'daily-list-done', countId: 'daily-count-done', label: 'Completadas' }
];

function renderTaskCardsHTML(tasks) {
    if (!tasks || tasks.length === 0) {
        return `<p class="text-xs text-slate-400 dark:text-slate-500 text-center pt-4">No hay tareas</p>`;
    }
    const users = appState.collectionsById.usuarios || new Map();
    const priorityStyles = { high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-green-500' };
    return tasks.map(task => {
        const assignee = users.get(task.assigneeUid);
        const style = priorityStyles[task.priority || 'medium'];
        const isCompleted = task.status === 'done' || task.isArchived;
        const canDrag = (getActiveRole() === 'admin' || appState.currentUser.uid === task.assigneeUid) && !task.isArchived;
        const dragClass = canDrag ? 'cursor-grab' : 'no-drag';
        const canComplete = !isCompleted && (canDrag || appState.currentUser.uid === task.creatorUid);
        const completeButton = canComplete ? `<button data-action="complete-task" title="Marcar como completada" class="complete-task-btn opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-green-100 text-green-600 hover:bg-green-200"><i data-lucide="check" class="w-3.5 h-3.5 pointer-events-none"></i></button>` : '';
        const blockButton = canComplete ? `<button data-action="block-task" title="Bloquear Tarea" class="block-task-btn opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200"><i data-lucide="lock" class="w-3.5 h-3.5 pointer-events-none"></i></button>` : '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let dueDateHTML = '';
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            const isOverdue = dueDate < today;
            const dateClass = isOverdue ? 'text-red-600 font-bold' : 'text-slate-500';
            dueDateHTML = `<span class="flex items-center gap-1.5 font-medium ${dateClass}" title="Fecha Límite: ${task.dueDate}"><i data-lucide="calendar-check" class="w-3.5 h-3.5"></i><span>${dueDate.toLocaleDateString('es-AR')}</span></span>`;
        }
        const datesHTML = dueDateHTML ? `<div class="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-600/60 flex items-center justify-end text-xs">${dueDateHTML}</div>` : '';

        const efforts = {
            low: { label: 'Bajo', icon: 'battery-low' },
            medium: { label: 'Medio', icon: 'battery-medium' },
            high: { label: 'Alto', icon: 'battery-full' }
        };
        const effortInfo = efforts[task.effort || 'low'];
        const effortIcon = effortInfo ? `<span title="Esfuerzo: ${effortInfo.label}"><i data-lucide="${effortInfo.icon}" class="w-4 h-4 text-slate-500 dark:text-slate-400"></i></span>` : '';

        return `
            <div class="task-card-compact group border bg-white/80 dark:bg-slate-700/80 rounded-md p-2 mb-2 shadow-sm hover:shadow-lg hover:border-blue-500 transition-all duration-200 ${dragClass}" data-task-id="${task.docId}" data-assignee-uid="${task.assigneeUid}">
                <div class="flex items-start justify-between"><p class="font-semibold text-xs text-slate-700 dark:text-slate-200 leading-tight flex-grow pr-2">${task.title}</p><span class="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${style}" title="Prioridad: ${task.priority}"></span></div>
                ${datesHTML}
                <div class="flex items-end justify-between mt-1">
                    <div class="flex items-center gap-2">${completeButton}${blockButton}${effortIcon}</div>
                    <span class="text-right text-[11px] text-slate-500 dark:text-slate-400">${assignee ? assignee.name.split(' ')[0] : 'N/A'}</span>
                </div>
            </div>`;
    }).join('');
}

function showPlannerHelpModal() {
    dom.modalContainer.innerHTML = getPlannerHelpModalHTML();
    const modalElement = document.getElementById('planner-help-modal');
    if (!modalElement) return;

    const closeModal = () => {
        modalElement.remove();
    };

    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement || event.target.closest('[data-action="close"]')) {
            closeModal();
        }
    });

    lucide.createIcons();
}

function showTasksInModal(title, tasks = []) {
    dom.modalContainer.innerHTML = getTasksModalHTML(title);
    const modalElement = document.getElementById('tasks-list-modal');
    if (!modalElement) return;

    const tasksContainer = modalElement.querySelector('#modal-tasks-container');
    if (!tasksContainer) return;

    const taskMap = new Map(tasks.map(task => [task.docId, { ...task }]));

    const renderModalTasks = () => {
        if (taskMap.size === 0) {
            tasksContainer.innerHTML = `<p class="text-center text-slate-500 py-8">No hay tareas para mostrar en esta sección.</p>`;
            return;
        }

        tasksContainer.innerHTML = `
            <div class="space-y-2">
                ${renderTaskCardsHTML(Array.from(taskMap.values()))}
            </div>
        `;
        lucide.createIcons();
    };

    const notifyTasksChanged = () => {
        document.dispatchEvent(new CustomEvent('ai-tasks-updated'));
    };

    const handleTaskRemoval = (taskId) => {
        taskMap.delete(taskId);
        renderModalTasks();
    };

    tasksContainer.addEventListener('click', async (event) => {
        const actionButton = event.target.closest('button[data-action]');
        const taskCard = event.target.closest('.task-card-compact');
        const taskId = taskCard?.dataset.taskId;

        if (actionButton && taskId) {
            const action = actionButton.dataset.action;
            if (action === 'complete-task') {
                const previousHTML = actionButton.innerHTML;
                actionButton.disabled = true;
                actionButton.innerHTML = '<span class="flex items-center gap-1"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Procesando</span>';
                lucide.createIcons();
                try {
                    await completeAndArchiveTask(taskId);
                    showToast('Tarea completada y archivada.', 'success');
                    handleTaskRemoval(taskId);
                    notifyTasksChanged();
                    await refreshWeeklyTasksView();
                } catch (error) {
                    console.error('Error completing task from modal:', error);
                    showToast('Error al completar la tarea.', 'error');
                    actionButton.disabled = false;
                    actionButton.innerHTML = previousHTML;
                    lucide.createIcons();
                }
                return;
            }

            if (action === 'block-task') {
                const task = taskMap.get(taskId) || weeklyTasksCache.find(t => t.docId === taskId);
                if (!task) return;
                const isBlocked = !task.blocked;
                try {
                    await updateTaskBlockedStatus(taskId, isBlocked);
                    task.blocked = isBlocked;
                    showToast(isBlocked ? 'Tarea bloqueada.' : 'Tarea desbloqueada.', 'success');
                    notifyTasksChanged();
                    await refreshWeeklyTasksView();
                    handleTaskRemoval(taskId);
                } catch (error) {
                    console.error('Error updating task blocked status from modal:', error);
                    showToast('Error al actualizar la tarea.', 'error');
                }
                return;
            }
        }

        if (taskCard && taskId && !actionButton) {
            const task = taskMap.get(taskId) || weeklyTasksCache.find(t => t.docId === taskId);
            if (task) {
                await openTaskFormModal(task);
            }
        }
    });

    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement || event.target.closest('[data-action="close"]')) {
            modalElement.remove();
        }
    });

    renderModalTasks();
}

function getRollingMonths(yearOffset = 0) {
    const baseYear = new Date().getFullYear() + yearOffset;
    return Array.from({ length: 12 }).map((_, monthIndex) => {
        const key = `${baseYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        return {
            key,
            label: `${MONTH_NAMES[monthIndex]} ${baseYear}`,
            monthIndex,
            year: baseYear
        };
    });
}

function buildMonthlySummary(tasks) {
    const summary = new Map();
    tasks.forEach(task => {
        if (!task.plannedDate) return;
        const date = new Date(`${task.plannedDate}T12:00:00`);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!summary.has(key)) {
            summary.set(key, []);
        }
        summary.get(key).push(task);
    });
    return summary;
}

function getWeekBucketsForMonth(year, monthIndex, tasks) {
    const cacheKey = `${year}-${monthIndex}`;
    if (monthWeekBucketsCache.has(cacheKey)) {
        return monthWeekBucketsCache.get(cacheKey);
    }

    const firstDayOfMonth = new Date(year, monthIndex, 1, 12);
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0, 12);

    const firstWeekday = new Date(firstDayOfMonth);
    while (firstWeekday.getDay() === 0 || firstWeekday.getDay() === 6) {
        firstWeekday.setDate(firstWeekday.getDate() + 1);
    }

    const lastWeekday = new Date(lastDayOfMonth);
    while (lastWeekday.getDay() === 0 || lastWeekday.getDay() === 6) {
        lastWeekday.setDate(lastWeekday.getDate() - 1);
    }

    if (firstWeekday > lastWeekday) {
        firstWeekday.setTime(firstDayOfMonth.getTime());
        lastWeekday.setTime(lastDayOfMonth.getTime());
    }

    let currentMonday = getMondayForDate(firstWeekday);
    const finalMonday = getMondayForDate(lastWeekday);
    const buckets = [];

    while (currentMonday.getTime() <= finalMonday.getTime()) {
        const startDate = new Date(currentMonday);
        const endDate = new Date(currentMonday);
        endDate.setDate(endDate.getDate() + 4);

        buckets.push({
            label: `Semana ${buckets.length + 1}`,
            startDate: new Date(startDate),
            endDate,
            tasks: []
        });

        currentMonday = new Date(currentMonday);
        currentMonday.setDate(currentMonday.getDate() + 7);
        currentMonday = getMondayForDate(currentMonday);
    }

    if (buckets.length === 0) {
        const startDate = getMondayForDate(firstDayOfMonth);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 4);
        buckets.push({ label: 'Semana 1', startDate, endDate, tasks: [] });
    }

    tasks.forEach(task => {
        if (!task.plannedDate) return;
        const date = new Date(`${task.plannedDate}T12:00:00`);
        if (Number.isNaN(date.getTime())) return;
        if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return;
        const monday = getMondayForDate(date);
        const bucket = buckets.find(item => item.startDate.getTime() === monday.getTime());
        if (bucket) {
            bucket.tasks.push(task);
        }
    });

    buckets.forEach(bucket => {
        bucket.tasks.sort((a, b) => {
            const dateA = a.plannedDate ? new Date(`${a.plannedDate}T12:00:00`).getTime() : Number.POSITIVE_INFINITY;
            const dateB = b.plannedDate ? new Date(`${b.plannedDate}T12:00:00`).getTime() : Number.POSITIVE_INFINITY;
            if (dateA === dateB) return (a.priority || '').localeCompare(b.priority || '');
            return dateA - dateB;
        });
    });

    monthWeekBucketsCache.set(cacheKey, buckets);
    return buckets;
}

function formatWeekRangeLabel(range) {
    const start = range.startDate;
    const end = range.endDate;
    const startDay = String(start.getDate()).padStart(2, '0');
    const endDay = String(end.getDate()).padStart(2, '0');
    const startMonthName = MONTH_NAMES[start.getMonth()];
    const endMonthName = MONTH_NAMES[end.getMonth()];

    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${startDay} - ${endDay} de ${endMonthName} ${end.getFullYear()}`;
    }

    return `${startDay} de ${startMonthName} ${start.getFullYear()} - ${endDay} de ${endMonthName} ${end.getFullYear()}`;
}

function getMondayForDate(baseDate) {
    const reference = new Date(baseDate);
    reference.setHours(12, 0, 0, 0);
    const day = reference.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    reference.setDate(reference.getDate() + diff);
    reference.setHours(12, 0, 0, 0);
    return reference;
}

function calculateWeekOffsetFromToday(targetDate) {
    const today = new Date();
    const currentMonday = getMondayForDate(today);
    const targetMonday = getMondayForDate(targetDate);
    const diffMs = targetMonday.getTime() - currentMonday.getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return Math.round(diffMs / weekMs);
}

function transitionFromMonthlyToWeekly(selectedMonth, selectedWeek) {
    if (!selectedMonth || !selectedWeek) return;
    if (isPlannerTransitioning) return;

    const monthlyContainer = document.getElementById('monthly-view-container');
    const weeklyContainer = document.getElementById('weekly-view-container');
    if (!monthlyContainer || !weeklyContainer) return;

    isPlannerTransitioning = true;
    let transitionCompleted = false;

    const finalizeTransition = () => {
        if (transitionCompleted) return;
        transitionCompleted = true;
        isPlannerTransitioning = false;
        ensurePlannerContainersVisibility();
    };

    const targetDate = new Date(selectedWeek.startDate);
    targetDate.setHours(12, 0, 0, 0);
    const previousOffset = typeof appState.weekOffset === 'number' ? appState.weekOffset : 0;
    const computedOffset = calculateWeekOffsetFromToday(targetDate);
    const direction = computedOffset === previousOffset
        ? 'jump'
        : (computedOffset > previousOffset ? 'next' : 'prev');

    appState.weekOffset = computedOffset;
    appState.plannerViewMode = 'weekly';
    updatePlannerViewToggleButtons();

    weeklyContainer.classList.remove('hidden', 'slide-in-right', 'slide-in-left');
    monthlyContainer.classList.remove('hidden', 'slide-out-left', 'slide-out-right');

    monthlyContainer.classList.add('slide-out-left');
    const handleMonthlyAnimationEnd = () => {
        monthlyContainer.classList.add('hidden');
        monthlyContainer.classList.remove('slide-out-left');
        monthlyContainer.removeEventListener('animationend', handleMonthlyAnimationEnd);
    };
    monthlyContainer.addEventListener('animationend', handleMonthlyAnimationEnd);

    weeklyContainer.classList.add('slide-in-right');
    weeklyContainer.addEventListener('animationend', () => {
        weeklyContainer.classList.remove('slide-in-right');
        finalizeTransition();
    }, { once: true });

    setTimeout(finalizeTransition, 400);
    refreshWeeklyTasksView(direction);
}

function updateMonthlyYearLabel() {
    const yearLabel = document.getElementById('monthly-year-label');
    if (!yearLabel) return;
    const currentYear = new Date().getFullYear() + monthlyViewState.yearOffset;
    yearLabel.textContent = currentYear.toString();
}

function updatePlannerViewToggleButtons() {
    const toggleContainer = document.getElementById('planner-view-toggle');
    if (!toggleContainer) return;
    const buttons = toggleContainer.querySelectorAll('.planner-toggle-btn');
    buttons.forEach(btn => {
        const isActive = btn.dataset.viewMode === appState.plannerViewMode;
        if (isActive) {
            btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-transparent', 'text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-300/60', 'dark:hover:bg-slate-600/70');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-transparent', 'text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-300/60', 'dark:hover:bg-slate-600/70');
        }
    });
}

function ensurePlannerContainersVisibility() {
    const weeklyContainer = document.getElementById('weekly-view-container');
    const monthlyContainer = document.getElementById('monthly-view-container');
    const dailyContainer = document.getElementById('daily-view-container');
    if (weeklyContainer) {
        weeklyContainer.classList.toggle('hidden', appState.plannerViewMode !== 'weekly');
    }
    if (dailyContainer) {
        const isDaily = appState.plannerViewMode === 'daily';
        dailyContainer.classList.toggle('hidden', !isDaily);
        if (isDaily) {
            renderDailyView(weeklyTasksCache);
        }
    }
    if (monthlyContainer) {
        monthlyContainer.classList.toggle('hidden', appState.plannerViewMode !== 'monthly');
        if (appState.plannerViewMode === 'monthly') {
            updateMonthlySectionsVisibility();
        }
    }
}

function toggleMonthlySectionVisibility(section, shouldShow) {
    if (!section) return;
    if (shouldShow) {
        if (section.classList.contains('hidden')) {
            section.classList.remove('hidden');
        }
        section.classList.remove('animate-fade-in-up');
        void section.offsetWidth; // force reflow to restart the animation
        section.classList.add('animate-fade-in-up');
    } else if (!section.classList.contains('hidden')) {
        section.classList.add('hidden');
    }
}

function updateMonthlySectionsVisibility() {
    const monthsSection = document.getElementById('monthly-months-section');
    const weeksSection = document.getElementById('monthly-weeks-section');
    const tasksSection = document.getElementById('monthly-tasks-section');

    toggleMonthlySectionVisibility(monthsSection, monthlyViewState.viewPhase === 'months');
    toggleMonthlySectionVisibility(weeksSection, monthlyViewState.viewPhase === 'weeks');
    toggleMonthlySectionVisibility(tasksSection, monthlyViewState.viewPhase === 'tasks');
}

function setPlannerViewMode(mode) {
    if (!['weekly', 'daily', 'monthly'].includes(mode)) return;
    if (appState.plannerViewMode === mode) return;
    appState.plannerViewMode = mode;
    if (mode === 'monthly') {
        monthlyViewState.viewPhase = 'months';
        monthlyViewState.selectedMonthKey = null;
        monthlyViewState.selectedWeekIndex = null;
    } else if (mode === 'daily') {
        if (!dailyViewState.selectedDate) {
            dailyViewState.selectedDate = getLocalISODate();
        }
    }
    ensurePlannerContainersVisibility();
    updatePlannerViewToggleButtons();
    if (mode === 'monthly') {
        const activeTasks = (weeklyTasksCache || []).filter(task => task.status !== 'done');
        updateMonthlyView(activeTasks);
    } else if (mode === 'daily') {
        renderDailyView(weeklyTasksCache);
    }
}

function selectMonthlyMonth(monthKey) {
    if (!monthKey) return;
    monthlyViewState.selectedMonthKey = monthKey;
    monthlyViewState.selectedWeekIndex = null;
    monthlyViewState.viewPhase = 'weeks';
    renderMonthlyMonthsGrid();
    renderMonthlyWeekList();
    renderMonthlyWeekTasks();
    updateMonthlySectionsVisibility();
}

function selectMonthlyWeek(monthKey, weekIndex) {
    if (typeof weekIndex !== 'number' || Number.isNaN(weekIndex)) return;
    if (monthKey && monthlyViewState.selectedMonthKey !== monthKey) {
        monthlyViewState.selectedMonthKey = monthKey;
    }
    monthlyViewState.selectedWeekIndex = weekIndex;
    monthlyViewState.viewPhase = 'tasks';
    renderMonthlyMonthsGrid();
    renderMonthlyWeekList();
    renderMonthlyWeekTasks();
    updateMonthlySectionsVisibility();

    const selectedMonth = monthlyViewState.months.find(month => month.key === monthlyViewState.selectedMonthKey);
    if (!selectedMonth) return;
    const monthTasks = monthlyViewState.monthlyTasksByKey.get(selectedMonth.key) || [];
    const weekBuckets = getWeekBucketsForMonth(selectedMonth.year, selectedMonth.monthIndex, monthTasks);
    const selectedWeek = weekBuckets[weekIndex];
    if (selectedWeek) {
        transitionFromMonthlyToWeekly(selectedMonth, selectedWeek);
    }
}

function returnToMonthlyMonths() {
    monthlyViewState.viewPhase = 'months';
    monthlyViewState.selectedWeekIndex = null;
    renderMonthlyMonthsGrid();
    renderMonthlyWeekList();
    renderMonthlyWeekTasks();
    updateMonthlySectionsVisibility();
}

function returnToMonthlyWeeks() {
    if (!monthlyViewState.selectedMonthKey) {
        monthlyViewState.viewPhase = 'months';
    } else {
        monthlyViewState.viewPhase = 'weeks';
    }
    renderMonthlyWeekList();
    renderMonthlyWeekTasks();
    updateMonthlySectionsVisibility();
}

function updateMonthlyView(tasks) {
    const monthlyContainer = document.getElementById('monthly-view-container');
    if (!monthlyContainer) return;

    monthlyViewState.months = getRollingMonths(monthlyViewState.yearOffset);
    monthlyViewState.monthlyTasksByKey = buildMonthlySummary(tasks || []);
    monthWeekBucketsCache = new Map();
    updateMonthlyYearLabel();

    const hasSelectedMonth = monthlyViewState.months.some(month => month.key === monthlyViewState.selectedMonthKey);
    if (!hasSelectedMonth) {
        monthlyViewState.selectedMonthKey = null;
        monthlyViewState.selectedWeekIndex = null;
        if (monthlyViewState.viewPhase !== 'months') {
            monthlyViewState.viewPhase = 'months';
        }
    }

    if (monthlyViewState.selectedMonthKey) {
        const selectedMonth = monthlyViewState.months.find(month => month.key === monthlyViewState.selectedMonthKey);
        if (selectedMonth) {
            const monthTasks = monthlyViewState.monthlyTasksByKey.get(selectedMonth.key) || [];
            const weekBuckets = getWeekBucketsForMonth(selectedMonth.year, selectedMonth.monthIndex, monthTasks);
            const isWeekValid = typeof monthlyViewState.selectedWeekIndex === 'number'
                && monthlyViewState.selectedWeekIndex >= 0
                && monthlyViewState.selectedWeekIndex < weekBuckets.length;
            if (!isWeekValid) {
                monthlyViewState.selectedWeekIndex = null;
                if (monthlyViewState.viewPhase === 'tasks') {
                    monthlyViewState.viewPhase = 'weeks';
                }
            }
        }
    } else if (monthlyViewState.viewPhase !== 'months') {
        monthlyViewState.viewPhase = 'months';
    }

    renderMonthlyMonthsGrid();
    renderMonthlyWeekList();
    renderMonthlyWeekTasks();
    updateMonthlySectionsVisibility();
}

function renderMonthlyMonthsGrid() {
    const monthsGrid = document.getElementById('monthly-months-grid');
    if (!monthsGrid) return;

    if (monthlyViewState.months.length === 0) {
        monthsGrid.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">No hay meses para mostrar.</p>`;
        return;
    }

    const cardsHTML = monthlyViewState.months.map(month => {
        const monthTasks = monthlyViewState.monthlyTasksByKey.get(month.key) || [];
        const isActive = month.key === monthlyViewState.selectedMonthKey && monthlyViewState.viewPhase !== 'months';
        const baseClasses = 'w-full text-left rounded-2xl border transition-all duration-200 px-5 py-6 flex flex-col gap-3 shadow-sm hover:-translate-y-1';
        const activeClasses = 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 shadow-md';
        const inactiveClasses = 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:bg-blue-50/60';
        return `
            <button type="button" data-month-key="${month.key}" class="${baseClasses} ${isActive ? activeClasses : inactiveClasses}">
                <div class="flex items-center justify-between">
                    <p class="text-sm font-semibold">${month.label}</p>
                    <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/70 text-blue-600 dark:text-blue-200 font-bold">${monthTasks.length}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">${monthTasks.length === 1 ? '1 tarea planificada' : `${monthTasks.length} tareas planificadas`}</p>
            </button>
        `;
    }).join('');

    monthsGrid.innerHTML = cardsHTML;
}

function renderMonthlyWeekList() {
    const weekListContainer = document.getElementById('monthly-week-list');
    const monthTitleElement = document.getElementById('monthly-selected-month-title');
    const monthTotalElement = document.getElementById('monthly-selected-month-total');
    if (!weekListContainer || !monthTitleElement || !monthTotalElement) return;

    const selectedMonth = monthlyViewState.months.find(month => month.key === monthlyViewState.selectedMonthKey);
    if (!selectedMonth) {
        weekListContainer.innerHTML = `<div class="col-span-full text-sm text-slate-500 dark:text-slate-400">Seleccioná un mes para ver sus semanas.</div>`;
        monthTitleElement.textContent = '';
        monthTotalElement.textContent = '';
        return;
    }

    const monthTasks = monthlyViewState.monthlyTasksByKey.get(selectedMonth.key) || [];
    monthTitleElement.textContent = selectedMonth.label;
    monthTotalElement.textContent = monthTasks.length === 1 ? '1 tarea planificada' : `${monthTasks.length} tareas planificadas`;

    const weekBuckets = getWeekBucketsForMonth(selectedMonth.year, selectedMonth.monthIndex, monthTasks);

    const cardsHTML = weekBuckets.map((bucket, index) => {
        const isActive = monthlyViewState.selectedWeekIndex === index;
        const baseClasses = 'w-full text-left rounded-2xl border px-4 py-4 transition-all duration-200 bg-white/80 dark:bg-slate-800/60 hover:-translate-y-1';
        const activeClasses = 'border-emerald-500 shadow-md';
        const inactiveClasses = 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-emerald-50/60';
        return `
            <button type="button" data-week-index="${index}" data-month-key="${selectedMonth.key}" class="${baseClasses} ${isActive ? activeClasses : inactiveClasses}">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-semibold">${bucket.label}</p>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${formatWeekRangeLabel(bucket)}</p>
                    </div>
                    <span class="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200 font-semibold">${bucket.tasks.length}</span>
                </div>
            </button>
        `;
    }).join('');

    weekListContainer.innerHTML = cardsHTML;
    attachMonthlyWeekButtonListeners();
}

function handleMonthlyWeekButtonClick(event) {
    const weekButton = event.currentTarget;
    const weekIndex = Number.parseInt(weekButton.dataset.weekIndex, 10);
    if (Number.isNaN(weekIndex)) return;
    const monthKey = weekButton.dataset.monthKey || monthlyViewState.selectedMonthKey;
    selectMonthlyWeek(monthKey, weekIndex);
}

function attachMonthlyWeekButtonListeners() {
    const weekListContainer = document.getElementById('monthly-week-list');
    if (!weekListContainer) return;
    const buttons = weekListContainer.querySelectorAll('button[data-week-index]');
    buttons.forEach(button => {
        button.removeEventListener('click', handleMonthlyWeekButtonClick);
        button.addEventListener('click', handleMonthlyWeekButtonClick);
    });
}

function renderMonthlyWeekTasks() {
    const tasksContainer = document.getElementById('monthly-week-tasks');
    const weekTitleElement = document.getElementById('monthly-selected-week-title');
    const weekTotalElement = document.getElementById('monthly-selected-week-total');
    if (!tasksContainer || !weekTitleElement || !weekTotalElement) return;

    const selectedMonth = monthlyViewState.months.find(month => month.key === monthlyViewState.selectedMonthKey);
    if (!selectedMonth) {
        tasksContainer.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Seleccioná un mes para ver las tareas.</p>`;
        weekTitleElement.textContent = '';
        weekTotalElement.textContent = '';
        return;
    }

    const monthTasks = monthlyViewState.monthlyTasksByKey.get(selectedMonth.key) || [];
    const weekBuckets = getWeekBucketsForMonth(selectedMonth.year, selectedMonth.monthIndex, monthTasks);
    const selectedWeek = typeof monthlyViewState.selectedWeekIndex === 'number' ? weekBuckets[monthlyViewState.selectedWeekIndex] : null;

    if (!selectedWeek) {
        tasksContainer.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Seleccioná una semana para ver sus tareas detalladas.</p>`;
        weekTitleElement.textContent = '';
        weekTotalElement.textContent = '';
        return;
    }

    const totalLabel = selectedWeek.tasks.length === 1 ? '1 tarea' : `${selectedWeek.tasks.length} tareas`;
    weekTitleElement.textContent = `${selectedWeek.label} · ${formatWeekRangeLabel(selectedWeek)}`;
    weekTotalElement.textContent = totalLabel;
    tasksContainer.innerHTML = `
        <div class="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            ${renderTaskCardsHTML(selectedWeek.tasks)}
        </div>
    `;
    lucide.createIcons();
}

function renderWeeklyTasks(tasks) {
    columnTasksMap.clear();
    const weeklyContainer = document.getElementById('weekly-tasks-container');
    const overdueContainer = document.querySelector('#overdue-tasks-container .task-list');
    const unscheduledContainer = document.querySelector('#unscheduled-tasks-container .task-list');
    const blockedContainer = document.querySelector('#blocked-tasks-container .task-list');
    if (!weeklyContainer || !overdueContainer || !unscheduledContainer || !blockedContainer) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const weekDates = getWeekDateRange(true);
    const mondayOfCurrentWeek = new Date(weekDates[0] + 'T00:00:00Z');
    const format = (d) => d.toISOString().split('T')[0];
    const nextWeekStart = new Date(mondayOfCurrentWeek); nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekEnd.getDate() + 4);
    const followingWeekStart = new Date(mondayOfCurrentWeek); followingWeekStart.setDate(followingWeekStart.getDate() + 14);
    const followingWeekEnd = new Date(followingWeekStart); followingWeekEnd.setDate(followingWeekEnd.getDate() + 4);

    const tasksByDay = { day0: [], day1: [], day2: [], day3: [], day4: [] };
    const nextWeekTasks = [], followingWeekTasks = [], overdueTasks = [], unscheduledTasks = [], blockedTasks = [];

    tasks.forEach(task => {
        if (task.blocked) { blockedTasks.push(task); return; }

        const isOverdue = task.dueDate && task.dueDate < todayStr;
        if (isOverdue) { overdueTasks.push(task); }

        if (!task.plannedDate) {
            if (!isOverdue) { unscheduledTasks.push(task); }
            return;
        }

        const plannedDate = new Date(task.plannedDate + 'T00:00:00Z');
        const diffDays = (plannedDate - mondayOfCurrentWeek) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0 && diffDays < 5) {
            const dayIndex = plannedDate.getUTCDay() - 1;
            if (dayIndex >= 0 && dayIndex < 5) tasksByDay[`day${dayIndex}`].push(task);
        } else if (task.plannedDate >= format(nextWeekStart) && task.plannedDate <= format(nextWeekEnd)) {
            nextWeekTasks.push(task);
        } else if (task.plannedDate >= format(followingWeekStart) && task.plannedDate <= format(followingWeekEnd)) {
            followingWeekTasks.push(task);
        }
    });

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    let dayColumnsHTML = dayNames.map((dayName, index) => {
        const dateForColumn = weekDates[index];
        const date = new Date(dateForColumn + 'T00:00:00');
        const isToday = dateForColumn === todayStr;
        const tasksForDay = tasksByDay[`day${index}`] || [];
        const taskCount = tasksForDay.length;
        const titleWithDate = `${dayName} <span class="text-sm font-normal text-slate-400 dark:text-slate-500 ml-1">${date.getDate()}/${date.getMonth() + 1}</span>`;
        return renderTaskColumn(titleWithDate, tasksForDay, { 'data-date': dateForColumn }, isToday, taskCount);
    }).join('');
    dayColumnsHTML += renderTaskColumn('semana +1', nextWeekTasks, { 'data-column-type': 'next-week' }, false, nextWeekTasks.length);
    dayColumnsHTML += renderTaskColumn('semana +2', followingWeekTasks, { 'data-column-type': 'following-week' }, false, followingWeekTasks.length);

    weeklyContainer.innerHTML = dayColumnsHTML;
    overdueContainer.innerHTML = renderTaskCardsHTML(overdueTasks);
    unscheduledContainer.innerHTML = renderTaskCardsHTML(unscheduledTasks);
    blockedContainer.innerHTML = renderTaskCardsHTML(blockedTasks);
    lucide.createIcons();
    initWeeklyTasksSortable();
}

function renderTaskColumn(title, tasks, attributes, isToday = false, taskCount = 0) {
    const TASK_LIMIT = 4;
    const totalTasks = tasks.length;
    let taskCardsHTML;
    let viewMoreButtonHTML = '';

    // The key for our map will be the unique identifier of the column
    const columnId = attributes['data-date'] || attributes['data-column-type'];
    if (columnId) {
        columnTasksMap.set(columnId, tasks);
    }

    if (totalTasks > TASK_LIMIT) {
        const visibleTasks = tasks.slice(0, TASK_LIMIT);
        taskCardsHTML = renderTaskCardsHTML(visibleTasks);

        const remainingCount = totalTasks - TASK_LIMIT;
        viewMoreButtonHTML = `
            <button data-action="show-all-tasks-modal" data-column-id="${columnId}" class="w-full text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-2 py-1">
                Ver ${remainingCount} más...
            </button>
        `;

    } else {
        taskCardsHTML = renderTaskCardsHTML(tasks);
    }

    const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');
    const taskCountHTML = taskCount > 0 ? `<span class="ml-2 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">${taskCount}</span>` : '';
    const titleHTML = title ? `<h4 class="column-title text-base font-bold text-center text-slate-600 dark:text-slate-300 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-center">${title}${taskCountHTML}</h4>` : '';
    let columnClasses = title ? "bg-slate-50 dark:bg-slate-800 rounded-xl p-3" : "";
    if (isToday) {
        columnClasses += " border-2 border-blue-500 dark:border-blue-400";
    }


    return `
        <div class="task-column-container ${columnClasses}">
            ${titleHTML}
            <div class="task-list-wrapper">
                <div class="task-list space-y-1 h-full" ${attrs}>
                    ${taskCardsHTML}
                </div>
                ${viewMoreButtonHTML}
            </div>
        </div>`;
}

function renderDailyView(tasks = []) {
    const container = document.getElementById('daily-view-container');
    if (!container) return;

    updateDailyDateUI();

    const selectedDate = dailyViewState.selectedDate;
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const tasksForDay = safeTasks.filter(task => {
        if (!task || task.isArchived) return false;
        return task.plannedDate === selectedDate;
    });

    const groupedTasks = {
        todo: [],
        inprogress: [],
        done: []
    };

    tasksForDay.forEach(task => {
        const statusKey = (task.status || 'todo').toLowerCase();
        if (groupedTasks[statusKey]) {
            groupedTasks[statusKey].push(task);
        } else {
            groupedTasks.todo.push(task);
        }
    });

    const totalTasks = tasksForDay.length;
    const doneCount = groupedTasks.done.length;
    const inProgressCount = groupedTasks.inprogress.length;
    const progress = totalTasks === 0 ? 0 : Math.round((doneCount / totalTasks) * 100);

    const progressBar = document.getElementById('daily-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    const progressLabel = document.getElementById('daily-progress-percentage');
    if (progressLabel) {
        progressLabel.textContent = `${progress}%`;
    }
    const summaryElement = document.getElementById('daily-progress-summary');
    if (summaryElement) {
        summaryElement.textContent = totalTasks === 0
            ? 'No hay tareas planificadas.'
            : `${doneCount} de ${totalTasks} tareas completadas · ${inProgressCount} en progreso.`;
    }

    DAILY_STATUS_CONFIG.forEach(config => {
        const listElement = document.getElementById(config.listId);
        const countElement = document.getElementById(config.countId);
        if (countElement) {
            countElement.textContent = groupedTasks[config.key]?.length.toString() ?? '0';
        }
        if (listElement) {
            const sortedTasks = sortTasksForDailyColumn(groupedTasks[config.key]);
            listElement.innerHTML = renderTaskCardsHTML(sortedTasks);
        }
    });

    lucide.createIcons();
    initDailySortable();
}

function initDailySortable() {
    const lists = document.querySelectorAll('.daily-task-list');
    if (lists.length === 0 || typeof Sortable === 'undefined') return;

    lists.forEach(list => {
        if (list.sortableInstance) {
            list.sortableInstance.destroy();
        }

        list.sortableInstance = new Sortable(list, {
            group: 'daily-planning',
            animation: 150,
            filter: '.no-drag',
            preventOnFilter: true,
            ghostClass: 'sortable-ghost-custom',
            onEnd: async (evt) => {
                const taskId = evt?.item?.dataset?.taskId;
                const fromStatus = evt?.from?.dataset?.status;
                const toStatus = evt?.to?.dataset?.status;

                if (!taskId || !toStatus || toStatus === fromStatus || evt.item.classList.contains('no-drag')) {
                    renderDailyView(weeklyTasksCache);
                    return;
                }

                try {
                    await updateTaskStatus(taskId, toStatus);
                    const statusLabel = DAILY_STATUS_CONFIG.find(config => config.key === toStatus)?.label || 'nuevo estado';
                    showToast(`Tarea movida a "${statusLabel}".`, 'success');
                } catch (error) {
                    console.error('Error updating daily task status:', error);
                    showToast('Error al actualizar el estado de la tarea.', 'error');
                } finally {
                    refreshWeeklyTasksView('jump');
                }
            }
        });
    });
}

function initWeeklyTasksSortable() {
    const taskLists = document.querySelectorAll('.task-list');
    if (taskLists.length === 0) return;
    const today = new Date();
    today.setDate(today.getDate() + (appState.weekOffset * 7));
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const format = (d) => d.toISOString().split('T')[0];

    taskLists.forEach(list => {
        if (list.sortable) list.sortable.destroy();
        new Sortable(list, {
            group: 'weekly-planning',
            animation: 150,
            filter: '.no-drag',
            preventOnFilter: true,
            ghostClass: 'sortable-ghost-custom',
            onMove: function(evt) {
                const fromColumnType = evt.from.dataset.columnType;
                const toColumnType = evt.to.dataset.columnType;

                // Rule 1: Prevent dragging FROM "Blocked" column to any other column.
                if (fromColumnType === 'blocked' && fromColumnType !== toColumnType) {
                    return false; // Disallow the move
                }

                // Rule 2: Prevent dragging TO "Overdue" column from any other column.
                if (toColumnType === 'overdue') {
                    return false; // Disallow the move
                }

                // Rule 3: Allow dragging from "Overdue" to other valid columns (except "Blocked").
                if (fromColumnType === 'overdue' && toColumnType !== 'blocked') {
                    return true;
                }

                return true; // Allow all other moves
            },
            onStart: () => {
                document.querySelectorAll('.task-list').forEach(el => {
                    const columnType = el.dataset.columnType;
                    // Highlight valid drop targets
                    if (columnType !== 'overdue' && columnType !== 'blocked') {
                        el.closest('.task-column-container, .bg-red-50, .bg-amber-50, .bg-slate-50')?.classList.add('drop-target-highlight');
                    }
                });
            },
            onEnd: async (evt) => {
                document.querySelectorAll('.drop-target-highlight').forEach(el => el.classList.remove('drop-target-highlight'));
                const taskId = evt.item.dataset.taskId;
                const fromColumnType = evt.from.dataset.columnType;
                const newColumn = evt.to;
                const columnType = newColumn.dataset.columnType;

                // Final check: Do not update if the task was from the blocked column
                if (fromColumnType === 'blocked' && evt.from !== evt.to) {
                    showToast('Las tareas bloqueadas no se pueden mover.', 'error');
                    refreshWeeklyTasksView();
                    return;
                }
                if (columnType === 'overdue') {
                    showToast('No se puede arrastrar una tarea a la columna "Vencidas".', 'error');
                    refreshWeeklyTasksView();
                    return;
                }
                if (!taskId) {
                    console.error("Task ID is missing.");
                    refreshWeeklyTasksView();
                    return;
                }

                let newDate;
                if (newColumn.dataset.date) newDate = newColumn.dataset.date;
                else if (columnType === 'unscheduled') newDate = null;
                else if (columnType === 'next-week') { const d = new Date(monday); d.setDate(monday.getDate() + 7); newDate = format(d); }
                else if (columnType === 'following-week') { const d = new Date(monday); d.setDate(monday.getDate() + 14); newDate = format(d); }

                try {
                    await updateDoc(doc(db, COLLECTIONS.TAREAS, taskId), {
                        plannedDate: newDate
                    });
                    showToast('Fecha de tarea planificada actualizada.', 'success');
                    refreshWeeklyTasksView();
                } catch (error) {
                    console.error("Error updating task plannedDate:", error);
                    showToast('Error al actualizar la tarea.', 'error');
                    refreshWeeklyTasksView();
                }
            }
        });
    });
}

async function fetchWeeklyTasks() {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const user = appState.currentUser;
    // Corrected Query: Fetch all relevant tasks and filter on the client.
    // This avoids the invalid compound inequality query.
    const q = query(tasksRef, or(
        where('isPublic', '==', true),
        where('creatorUid', '==', user.uid),
        where('assigneeUid', '==', user.uid)
    ));

    try {
        const querySnapshot = await getDocs(q);
        // Filter out archived tasks on the client side.
        return querySnapshot.docs
            .map(doc => ({ ...doc.data(), docId: doc.id }))
            .filter(task => !task.isArchived);
    } catch (error) {
        console.error("Error fetching weekly tasks:", error);
        if (error.code === 'failed-precondition') {
            showToast('Se necesita un índice de base de datos para una consulta eficiente. Revise la consola.', 'error', 5000);
            // Fallback to three simpler queries combined on the client while the index is created.
            const fallbackQueries = [
                query(tasksRef, where('isPublic', '==', true)),
                query(tasksRef, where('creatorUid', '==', user.uid)),
                query(tasksRef, where('assigneeUid', '==', user.uid))
            ];

            const snapshots = await Promise.all(fallbackQueries.map(simpleQuery => getDocs(simpleQuery)));
            const dedupedTasks = new Map();

            snapshots.forEach(snapshot => {
                snapshot.docs.forEach(docSnap => {
                    if (!dedupedTasks.has(docSnap.id)) {
                        dedupedTasks.set(docSnap.id, { ...docSnap.data(), docId: docSnap.id });
                    }
                });
            });

            return Array.from(dedupedTasks.values()).filter(task => !task.isArchived);
        } else {
            showToast('Error al cargar las tareas.', 'error');
        }
        return [];
    }
}

function setupActionButtons() {
    document.getElementById('show-planner-help-btn')?.addEventListener('click', () => showPlannerHelpModal());
    const plannerToggleButtons = document.querySelectorAll('#planner-view-toggle .planner-toggle-btn');
    plannerToggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.viewMode;
            if (mode) {
                setPlannerViewMode(mode);
            }
        });
    });
    document.getElementById('daily-prev-day-btn')?.addEventListener('click', () => adjustDailyViewDate(-1));
    document.getElementById('daily-next-day-btn')?.addEventListener('click', () => adjustDailyViewDate(1));
    document.getElementById('daily-today-btn')?.addEventListener('click', () => setDailyViewDate(getLocalISODate()));
    document.getElementById('daily-date-picker')?.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value) {
            setDailyViewDate(value);
        }
    });
    document.getElementById('monthly-prev-year-btn')?.addEventListener('click', () => {
        monthlyViewState.yearOffset--;
        monthlyViewState.selectedMonthKey = null;
        monthlyViewState.selectedWeekIndex = null;
        monthlyViewState.viewPhase = 'months';
        updateMonthlyView(weeklyTasksCache);
    });
    document.getElementById('monthly-next-year-btn')?.addEventListener('click', () => {
        monthlyViewState.yearOffset++;
        monthlyViewState.selectedMonthKey = null;
        monthlyViewState.selectedWeekIndex = null;
        monthlyViewState.viewPhase = 'months';
        updateMonthlyView(weeklyTasksCache);
    });
    const monthlyContainer = document.getElementById('monthly-view-container');
    monthlyContainer?.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (actionButton) {
            const action = actionButton.dataset.action;
            if (action === 'monthly-back-to-months') {
                returnToMonthlyMonths();
                return;
            }
            if (action === 'monthly-back-to-weeks') {
                returnToMonthlyWeeks();
                return;
            }
        }
        const monthButton = event.target.closest('[data-month-key]');
        if (monthButton) {
            selectMonthlyMonth(monthButton.dataset.monthKey);
            return;
        }
    });
    document.getElementById('ai-assistant-btn')?.addEventListener('click', () => {
        if (openAIAssistantModal) {
            openAIAssistantModal();
        } else {
            showToast('El Asistente IA no está disponible.', 'error');
        }
    });
    document.getElementById('prev-week-btn')?.addEventListener('click', () => { appState.weekOffset--; refreshWeeklyTasksView('prev'); });
    document.getElementById('today-btn')?.addEventListener('click', () => {
        if (appState.weekOffset === 0) {
            showToast('Ya estás en la semana actual.', 'info');
            return;
        }
        const direction = appState.weekOffset > 0 ? 'prev' : 'next';
        appState.weekOffset = 0;
        refreshWeeklyTasksView(direction);
    });
    document.getElementById('next-week-btn')?.addEventListener('click', () => { appState.weekOffset++; refreshWeeklyTasksView('next'); });
    const weeklyContainer = document.getElementById('weekly-tasks-container');
    weeklyContainer?.addEventListener('click', async (e) => {
        const target = e.target;
        const viewMoreBtn = target.closest('[data-action="show-all-tasks-modal"]');

        if (viewMoreBtn) {
            const columnId = viewMoreBtn.dataset.columnId;
            const tasks = columnTasksMap.get(columnId);
            const columnContainer = viewMoreBtn.closest('.task-column-container');
            const titleElement = columnContainer.querySelector('.column-title');
            const title = titleElement ? titleElement.textContent : 'Tareas';

            if (tasks) {
                showTasksInModal(title, tasks);
            }
            return;
        }
    });
}

async function refreshWeeklyTasksView(direction = 'next') {
    const weekInfo = getWeekInfo(appState.weekOffset);
    const weekDisplay = document.getElementById('week-display');
    if (weekDisplay) weekDisplay.textContent = `Semana ${weekInfo.weekNumber} - ${weekInfo.monthName} ${weekInfo.year}`;
    const container = document.getElementById('weekly-tasks-container');
    if (!container) return;
    const slideOutClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const slideInClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

    const fetchAndRenderTasks = async () => {
        const tasks = await fetchWeeklyTasks();
        weeklyTasksCache = tasks;
        const activeTasks = tasks.filter(task => task.status !== 'done');
        renderWeeklyTasks(activeTasks);
        updateMonthlyView(activeTasks);
        renderDailyView(tasks);
    };

    if (appState.plannerViewMode === 'monthly' || appState.plannerViewMode === 'daily') {
        try {
            await fetchAndRenderTasks();
        } catch (error) {
            console.error("Error refreshing monthly planner data:", error);
            showToast('Error al actualizar la vista de tareas.', 'error');
        }
        return;
    }

    if (direction === 'jump') {
        try {
            await fetchAndRenderTasks();
        } catch (error) {
            console.error("Error refreshing weekly tasks view:", error);
            showToast('Error al actualizar la vista de tareas.', 'error');
        }
        return;
    }

    container.classList.add(slideOutClass);
    container.addEventListener('animationend', async function onAnimationEnd() {
        container.removeEventListener('animationend', onAnimationEnd);
        try {
            await fetchAndRenderTasks();
            const newContainer = document.getElementById('weekly-tasks-container');
            if (newContainer) {
                newContainer.classList.remove(slideOutClass);
                newContainer.classList.add(slideInClass);
                newContainer.addEventListener('animationend', () => newContainer.classList.remove(slideInClass), { once: true });
            }
        } catch (error) {
            console.error("Error refreshing weekly tasks view:", error);
            showToast('Error al actualizar la vista de tareas.', 'error');
            container.classList.remove(slideOutClass, slideInClass);
        }
    }, { once: true });
}

/**
 * Orchestrates the landing page rendering cycle, focusing on the weekly
 * planner, backlog widgets, and related controls. Should be called whenever the
 * landing page view is activated.
 */
export async function runLandingPageLogic() {
    appState.weekOffset = 0;
    appState.plannerViewMode = 'weekly';
    monthlyViewState.yearOffset = 0;
    monthlyViewState.selectedMonthKey = null;
    monthlyViewState.selectedWeekIndex = null;
    monthlyViewState.viewPhase = 'months';
    dailyViewState.selectedDate = getLocalISODate();
    renderLandingPageHTML();
    updateDailyDateUI();
    renderDailyView([]);
    ensurePlannerContainersVisibility();
    updatePlannerViewToggleButtons();
    updateMonthlyYearLabel();
    await refreshWeeklyTasksView();
    setupActionButtons();

    // Listen for the custom event dispatched when the AI finishes its work
    document.removeEventListener('ai-tasks-updated', onAITasksUpdated);
    document.addEventListener('ai-tasks-updated', onAITasksUpdated);

    appState.currentViewCleanup = () => {
        document.removeEventListener('ai-tasks-updated', onAITasksUpdated);
    };

    // This listener handles clicks on the entire view, specifically for the complete task button
    const landingPageContainer = dom.viewContent.querySelector('#landing-page-container');
    if (!landingPageContainer) return;

    landingPageContainer.addEventListener('click', async (e) => {
        const completeBtn = e.target.closest('[data-action="complete-task"]');
        const blockBtn = e.target.closest('[data-action="block-task"]');
        const taskCard = e.target.closest('.task-card-compact');

        if (completeBtn) {
            const taskCard = completeBtn.closest('.task-card-compact');
            if (taskCard) {
                e.stopPropagation(); // Prevent other listeners from firing (like the one to open the modal)
                const taskId = taskCard.dataset.taskId;
                if (taskId) {
                    try {
                        // Optimistically update the UI
                        taskCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        taskCard.style.opacity = '0';
                        taskCard.style.transform = 'scale(0.95)';

                        await completeAndArchiveTask(taskId);
                        showToast('Tarea completada y archivada.', 'success');

                        // Wait for animation to finish before refreshing the data
                        setTimeout(() => {
                            refreshWeeklyTasksView();
                        }, 300);

                    } catch (error) {
                        console.error('Error completing task:', error);
                        showToast('Error al completar la tarea.', 'error');
                        // Restore card if the backend call fails
                        taskCard.style.opacity = '1';
                        taskCard.style.transform = 'scale(1)';
                    }
                }
            }
        } else if (blockBtn) {
            const taskCard = blockBtn.closest('.task-card-compact');
            if (taskCard) {
                e.stopPropagation();
                const taskId = taskCard.dataset.taskId;
                const task = weeklyTasksCache.find(t => t.docId === taskId);
                if (task) {
                    const isBlocked = !task.blocked;
                    try {
                        await updateTaskBlockedStatus(taskId, isBlocked);
                        showToast(isBlocked ? 'Tarea bloqueada.' : 'Tarea desbloqueada.', 'success');
                        refreshWeeklyTasksView();
                    } catch (error) {
                        console.error('Error updating task blocked status:', error);
                        showToast('Error al actualizar la tarea.', 'error');
                    }
                }
            }
        } else if (taskCard) {
            const taskId = taskCard.dataset.taskId;
            const task = weeklyTasksCache.find(t => t.docId === taskId);
            if (task) {
                await openTaskFormModal(task);
            }
        }
    });
}

/**
 * Receives the shared dependency bag from the host application so the planner
 * logic can interact with Firestore, UI helpers, and maintenance services.
 *
 * @param {Object} dependencies - Shared Firebase instances and helpers.
 */
export function initLandingPageModule(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    showToast = dependencies.showToast;
    openTaskFormModal = dependencies.openTaskFormModal;
    openAIAssistantModal = dependencies.openAIAssistantModal;
    functions = dependencies.functions;
    writeBatch = dependencies.writeBatch; // Injected dependency
}

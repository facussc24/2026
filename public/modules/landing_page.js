import { collection, getCountFromServer, getDocs, query, where, orderBy, limit, doc, updateDoc, or } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../utils.js';
import { showPlannerHelpModal, showAIAnalysisModal, showTasksInModal } from './tasks/task.ui.js';
import { completeAndArchiveTask } from './tasks/task.service.js';
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

// Functions from main.js to be injected
let seedDatabase;
let clearDataOnly;
let clearOtherUsers;

let weeklyTasksCache = [];
let columnTasksMap = new Map();

// --- 2. UI RENDERING ---

function getWeekInfo(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset * 7);

    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthName = monthNames[date.getMonth()];

    return {
        weekNumber,
        monthName,
        year: date.getFullYear()
    };
}

function renderLandingPageHTML() {
    dom.viewContent.innerHTML = `
        <div id="landing-page-container" class="animate-fade-in-up">
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                <div id="kpi-proyectos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div><p class="text-sm text-secondary-light dark:text-secondary-dark">Proyectos</p><p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p></div>
                    <div class="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full"><i data-lucide="folder-kanban" class="text-blue-500 dark:text-blue-400"></i></div>
                </div>
                <div id="kpi-productos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div><p class="text-sm text-secondary-light dark:text-secondary-dark">Productos</p><p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p></div>
                    <div class="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full"><i data-lucide="package" class="text-indigo-500 dark:text-indigo-400"></i></div>
                </div>
                <div id="kpi-usuarios" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div><p class="text-sm text-secondary-light dark:text-secondary-dark">Usuarios</p><p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p></div>
                    <div class="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-full"><i data-lucide="users" class="text-amber-500 dark:text-amber-400"></i></div>
                </div>
                <div id="kpi-insumos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div><p class="text-sm text-secondary-light dark:text-secondary-dark">Insumos</p><p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p></div>
                    <div class="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-full"><i data-lucide="box" class="text-emerald-500 dark:text-emerald-400"></i></div>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-6 mb-8">
                <div class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <div class="flex items-center gap-2">
                             <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Planificador Semanal</h3>
                             <button id="show-planner-help-btn" class="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="Ayuda sobre el planificador">
                                 <i data-lucide="help-circle" class="w-5 h-5"></i>
                             </button>
                        </div>
                        <div id="week-display" class="font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full"></div>
                        <div class="flex items-center gap-2">
                             <button id="prev-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Semana Anterior"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                            <button id="next-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Siguiente Semana"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                            <button id="gemini-create-task-btn" class="relative group bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-5 py-2.5 rounded-full hover:shadow-lg hover:shadow-purple-500/50 flex items-center shadow-md transition-all duration-300 transform hover:scale-105">
                                <span class="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></span>
                                <span class="relative flex items-center">
                                    <i data-lucide="sparkles" class="mr-2 h-5 w-5"></i>Crear con Gemini
                                </span>
                            </button>
                            <button id="add-new-dashboard-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105"><i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea</button>
                        </div>
                    </div>
                     <div id="priority-legend" class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-6 border-t border-b border-slate-200 dark:border-slate-700 py-2">
                        <span class="font-bold">Prioridad:</span>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span>Alta</div>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-yellow-500"></span>Media</div>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-500"></span>Baja</div>
                    </div>
                    <div id="weekly-tasks-container" class="grid grid-cols-1 lg:grid-cols-7 gap-6 min-h-[400px]"></div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div id="overdue-tasks-container" class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <h4 class="font-bold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2"><i data-lucide="alert-triangle"></i>Tareas Vencidas</h4>
                    <div class="task-list space-y-1 h-64 overflow-y-auto custom-scrollbar" data-column-type="overdue"></div>
                 </div>
                 <div id="unscheduled-tasks-container" class="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
                    <h4 class="font-bold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-2"><i data-lucide="calendar-x"></i>Tareas sin Fecha</h4>
                    <div class="task-list space-y-1 h-64 overflow-y-auto custom-scrollbar" data-column-type="unscheduled"></div>
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

function renderTaskCardsHTML(tasks) {
    if (!tasks || tasks.length === 0) {
        return `<p class="text-xs text-slate-400 dark:text-slate-500 text-center pt-4">No hay tareas</p>`;
    }
    const users = appState.collectionsById.usuarios || new Map();
    const priorityStyles = { high: 'bg-red-500', medium: 'bg-yellow-500', low: 'bg-green-500' };
    return tasks.map(task => {
        const assignee = users.get(task.assigneeUid);
        const style = priorityStyles[task.priority || 'medium'];
        const canDrag = appState.currentUser.role === 'admin' || appState.currentUser.uid === task.assigneeUid;
        const dragClass = canDrag ? 'cursor-grab' : 'no-drag';
        const canComplete = canDrag || appState.currentUser.uid === task.creatorUid;
        const completeButton = canComplete ? `<button data-action="complete-task" title="Marcar como completada" class="complete-task-btn opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-green-100 text-green-600 hover:bg-green-200"><i data-lucide="check" class="w-3.5 h-3.5 pointer-events-none"></i></button>` : '';

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
                    <div class="flex items-center gap-2">${completeButton}${effortIcon}</div>
                    <span class="text-right text-[11px] text-slate-500 dark:text-slate-400">${assignee ? assignee.name.split(' ')[0] : 'N/A'}</span>
                </div>
            </div>`;
    }).join('');
}

function renderWeeklyTasks(tasks) {
    columnTasksMap.clear();
    const weeklyContainer = document.getElementById('weekly-tasks-container');
    const overdueContainer = document.querySelector('#overdue-tasks-container .task-list');
    const unscheduledContainer = document.querySelector('#unscheduled-tasks-container .task-list');
    if (!weeklyContainer || !overdueContainer || !unscheduledContainer) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const weekDates = getWeekDateRange(true);
    const mondayOfCurrentWeek = new Date(weekDates[0] + 'T00:00:00Z');
    const format = (d) => d.toISOString().split('T')[0];
    const nextWeekStart = new Date(mondayOfCurrentWeek); nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekEnd.getDate() + 4);
    const followingWeekStart = new Date(mondayOfCurrentWeek); followingWeekStart.setDate(followingWeekStart.getDate() + 14);
    const followingWeekEnd = new Date(followingWeekStart); followingWeekEnd.setDate(followingWeekEnd.getDate() + 4);

    const tasksByDay = { day0: [], day1: [], day2: [], day3: [], day4: [] };
    const nextWeekTasks = [], followingWeekTasks = [], overdueTasks = [], unscheduledTasks = [];

    tasks.forEach(task => {
        if (task.dueDate && task.dueDate < todayStr) { overdueTasks.push(task); return; }
        if (!task.plannedDate) { unscheduledTasks.push(task); return; }
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
        const titleWithDate = `${dayName} <span class="text-sm font-normal text-slate-400 dark:text-slate-500">${date.getDate()}/${date.getMonth() + 1}</span>`;
        return renderTaskColumn(titleWithDate, tasksByDay[`day${index}`] || [], { 'data-date': dateForColumn });
    }).join('');
    dayColumnsHTML += renderTaskColumn('Semana Siguiente', nextWeekTasks, { 'data-column-type': 'next-week' });
    dayColumnsHTML += renderTaskColumn('Próxima Semana', followingWeekTasks, { 'data-column-type': 'following-week' });

    weeklyContainer.innerHTML = dayColumnsHTML;
    overdueContainer.innerHTML = renderTaskCardsHTML(overdueTasks);
    unscheduledContainer.innerHTML = renderTaskCardsHTML(unscheduledTasks);
    lucide.createIcons();
    initWeeklyTasksSortable();
}

function renderTaskColumn(title, tasks, attributes) {
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
    const titleHTML = title ? `<h4 class="column-title text-base font-bold text-center text-slate-600 dark:text-slate-300 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">${title}</h4>` : '';
    const columnClasses = title ? "bg-slate-50 dark:bg-slate-800 rounded-xl p-3" : "";

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
            group: 'weekly-planning', animation: 150, filter: '.no-drag',
            onStart: () => document.querySelectorAll('.task-list').forEach(el => el.closest('.bg-slate-50, .bg-red-50, .bg-amber-50')?.classList.add('drop-target-highlight')),
            onEnd: async (evt) => {
                document.querySelectorAll('.drop-target-highlight').forEach(el => el.classList.remove('drop-target-highlight'));
                const taskId = evt.item.dataset.taskId;
                const newColumn = evt.to;
                const columnType = newColumn.dataset.columnType;
                let newDate;
                if (newColumn.dataset.date) newDate = newColumn.dataset.date;
                else if (columnType === 'unscheduled') newDate = null;
                else if (columnType === 'next-week') { const d = new Date(monday); d.setDate(monday.getDate() + 7); newDate = format(d); }
                else if (columnType === 'following-week') { const d = new Date(monday); d.setDate(monday.getDate() + 14); newDate = format(d); }
                else if (columnType === 'overdue') { showToast('No se puede arrastrar una tarea a la columna "Vencidas".', 'error'); refreshWeeklyTasksView(); return; }
                if (!taskId) { console.error("Task ID is missing."); refreshWeeklyTasksView(); return; }
                try {
                    await updateDoc(doc(db, COLLECTIONS.TAREAS, taskId), { plannedDate: newDate });
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

async function fetchKpiData() {
    const kpiCollections = [ { name: 'Proyectos', key: COLLECTIONS.PROYECTOS }, { name: 'Productos', key: COLLECTIONS.PRODUCTOS }, { name: 'Usuarios', key: COLLECTIONS.USUARIOS }, { name: 'Insumos', key: COLLECTIONS.INSUMOS } ];
    const snapshots = await Promise.all(kpiCollections.map(c => getCountFromServer(collection(db, c.key))));
    const kpiData = {};
    snapshots.forEach((snap, index) => { kpiData[kpiCollections[index].name] = snap.data().count; });
    return kpiData;
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
        // Filter for pending tasks on the client side.
        return querySnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id })).filter(task => task.status !== 'done');
    } catch (error) {
        console.error("Error fetching weekly tasks:", error);
        if (error.code === 'failed-precondition') {
            showToast('Se necesita un índice de base de datos para una consulta eficiente. Revise la consola.', 'error', 5000);
            // Fallback to a potentially less performant but valid query if the index is missing.
            const fallbackQuery = query(tasksRef, where('assigneeUid', '==', user.uid));
            const fallbackSnapshot = await getDocs(fallbackQuery);
            return fallbackSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id })).filter(task => task.status !== 'done');
        } else {
            showToast('Error al cargar las tareas.', 'error');
        }
        return [];
    }
}

function updateKpiCards(kpiData) {
    document.querySelector('#kpi-proyectos p:nth-child(2)').textContent = kpiData.Proyectos || 0;
    document.querySelector('#kpi-productos p:nth-child(2)').textContent = kpiData.Productos || 0;
    document.querySelector('#kpi-usuarios p:nth-child(2)').textContent = kpiData.Usuarios || 0;
    document.querySelector('#kpi-insumos p:nth-child(2)').textContent = kpiData.Insumos || 0;
}

function setupActionButtons() {
    document.getElementById('show-planner-help-btn')?.addEventListener('click', () => showPlannerHelpModal());
    document.getElementById('gemini-create-task-btn')?.addEventListener('click', () => {
        if (openAIAssistantModal) {
            openAIAssistantModal();
        } else {
            showToast('El Asistente IA no está disponible.', 'error');
        }
    });
    document.getElementById('add-new-dashboard-task-btn')?.addEventListener('click', () => openTaskFormModal(null, 'todo'));
    document.getElementById('prev-week-btn')?.addEventListener('click', () => { appState.weekOffset--; refreshWeeklyTasksView('prev'); });
    document.getElementById('next-week-btn')?.addEventListener('click', () => { appState.weekOffset++; refreshWeeklyTasksView('next'); });
    const weeklyContainer = document.getElementById('weekly-tasks-container');
    weeklyContainer?.addEventListener('click', async (e) => {
        const target = e.target;
        const taskCard = target.closest('.task-card-compact');
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

        if (taskCard && !target.closest('[data-action="complete-task"]')) {
            const task = weeklyTasksCache.find(t => t.docId === taskCard.dataset.taskId);
            if (task) openTaskFormModal(task);
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
    container.classList.add(slideOutClass);
    container.addEventListener('animationend', async function onAnimationEnd() {
        container.removeEventListener('animationend', onAnimationEnd);
        try {
            const tasks = await fetchWeeklyTasks();
            weeklyTasksCache = tasks;
            renderWeeklyTasks(tasks);
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

export async function runLandingPageLogic() {
    appState.weekOffset = 0;
    renderLandingPageHTML();
    try {
        const kpiData = await fetchKpiData();
        updateKpiCards(kpiData);
        await refreshWeeklyTasksView();
    } catch (error) {
        console.error("Error loading landing page data:", error);
        showToast("Error al cargar los datos del dashboard.", "error");
    }
    setupActionButtons();

    // This listener handles clicks on the entire view, specifically for the complete task button
    const landingPageContainer = dom.viewContent.querySelector('#landing-page-container');
    if (!landingPageContainer) return;

    landingPageContainer.addEventListener('click', async (e) => {
        const completeBtn = e.target.closest('[data-action="complete-task"]');
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
        }
    });
}

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
    seedDatabase = dependencies.seedDatabase;
    clearDataOnly = dependencies.clearDataOnly;
    clearOtherUsers = dependencies.clearOtherUsers;
}
import { collection, getCountFromServer, getDocs, query, where, orderBy, limit, doc, updateDoc, or, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS } from '../utils.js';
import { showAIAnalysisModal } from './tasks/task.ui.js';


// --- 1. DEPENDENCIES AND STATE ---
let db;
let appState;
let dom;
let lucide;
let showToast;
let openTaskFormModal;
let functions;

// Functions from main.js to be injected
let seedDatabase;
let clearDataOnly;
let clearOtherUsers;

let weeklyTasksCache = [];

// --- 2. UI RENDERING ---

/**
 * Renders the main HTML structure of the new landing page.
 */
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
    console.log("Attempting to render Landing Page HTML into dom.viewContent");
    if (!dom || !dom.viewContent) {
        console.error("DOM object or dom.viewContent is not available. Cannot render landing page.");
        return;
    }
    dom.viewContent.innerHTML = `
        <div class="animate-fade-in-up">
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                <div id="kpi-proyectos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div>
                        <p class="text-sm text-secondary-light dark:text-secondary-dark">Proyectos</p>
                        <p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p>
                    </div>
                    <div class="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full">
                        <i data-lucide="folder-kanban" class="text-blue-500 dark:text-blue-400"></i>
                    </div>
                </div>
                <div id="kpi-productos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div>
                        <p class="text-sm text-secondary-light dark:text-secondary-dark">Productos</p>
                        <p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p>
                    </div>
                    <div class="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full">
                        <i data-lucide="package" class="text-indigo-500 dark:text-indigo-400"></i>
                    </div>
                </div>
                <div id="kpi-usuarios" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div>
                        <p class="text-sm text-secondary-light dark:text-secondary-dark">Usuarios</p>
                        <p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p>
                    </div>
                    <div class="bg-amber-100 dark:bg-amber-900/50 p-3 rounded-full">
                        <i data-lucide="users" class="text-amber-500 dark:text-amber-400"></i>
                    </div>
                </div>
                <div id="kpi-insumos" class="bg-card-light dark:bg-card-dark p-6 rounded-lg flex items-center justify-between shadow-sm">
                    <div>
                        <p class="text-sm text-secondary-light dark:text-secondary-dark">Insumos</p>
                        <p class="text-3xl font-bold text-text-light dark:text-text-dark">0</p>
                    </div>
                    <div class="bg-emerald-100 dark:bg-emerald-900/50 p-3 rounded-full">
                        <i data-lucide="box" class="text-emerald-500 dark:text-emerald-400"></i>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 gap-6 mb-8">
                <div class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <div class="flex items-center gap-4">
                             <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Planificador Semanal</h3>
                             <div id="week-display" class="font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full"></div>
                        </div>
                        <div class="flex items-center gap-2">
                             <button id="prev-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Semana Anterior">
                                <i data-lucide="chevron-left" class="w-5 h-5"></i>
                            </button>
                            <button id="next-week-btn" class="p-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600" title="Siguiente Semana">
                                <i data-lucide="chevron-right" class="w-5 h-5"></i>
                            </button>
                            <button id="ai-analyst-btn" class="bg-purple-600 text-white px-5 py-2.5 rounded-full hover:bg-purple-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                                <i data-lucide="brain-circuit" class="mr-2 h-5 w-5"></i>Analista IA
                            </button>
                            <button id="add-new-dashboard-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                                <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea
                            </button>
                        </div>
                    </div>
                     <div id="priority-legend" class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-6 border-t border-b border-slate-200 dark:border-slate-700 py-2">
                        <span class="font-bold">Prioridad:</span>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500"></span>Alta</div>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-yellow-500"></span>Media</div>
                        <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-500"></span>Baja</div>
                    </div>
                    <div id="weekly-tasks-container" class="grid grid-cols-1 lg:grid-cols-7 gap-6 min-h-[400px]">
                        <!-- Day columns will be injected here -->
                    </div>
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
            <div id="admin-actions-container" class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm">
                <h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark">Acciones de Base de Datos (Administrador)</h3>
                <div class="flex flex-col sm:flex-row gap-4">
                    <button id="seed-db-btn" class="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <i data-lucide="database-zap" class="w-5 h-5"></i>
                        <span>Poblar con datos de prueba</span>
                    </button>
                    <button id="clear-data-btn" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                        <span>Borrar solo datos</span>
                    </button>
                    <button id="clear-users-btn" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <i data-lucide="user-x" class="w-5 h-5"></i>
                        <span>Borrar otros usuarios</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
    console.log("Landing Page HTML rendered.");
}

function getWeekDateRange(returnFullWeek = false) {
    const today = new Date();
    // Adjust for week offset
    today.setDate(today.getDate() + (appState.weekOffset * 7));

    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    if (returnFullWeek) {
        const week = [];
        for (let i = 0; i < 5; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            week.push(date.toISOString().split('T')[0]);
        }
        return week;
    }

    const friday = new Date(monday);
    // Extend the range to cover the next two weeks for future columns
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
    const priorityStyles = {
        high: { label: 'Alta', color: 'bg-red-500' },
        medium: { label: 'Media', color: 'bg-yellow-500' },
        low: { label: 'Baja', color: 'bg-green-500' }
    };

    return tasks.map(task => {
        const assignee = users.get(task.assigneeUid);
        const priority = task.priority || 'medium';
        const style = priorityStyles[priority];
        const canDrag = appState.currentUser.role === 'admin' || appState.currentUser.uid === task.assigneeUid;
        const dragClass = canDrag ? 'cursor-grab' : 'no-drag';
        const canComplete = appState.currentUser.role === 'admin' || appState.currentUser.uid === task.assigneeUid || appState.currentUser.uid === task.creatorUid;
        const completeButton = canComplete
            ? `<button data-action="complete-task" title="Marcar como completada" class="complete-task-btn opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full bg-green-100 text-green-600 hover:bg-green-200">
                   <i data-lucide="check" class="w-3.5 h-3.5 pointer-events-none"></i>
               </button>`
            : '';

        return `
            <div class="task-card-compact group border bg-white/80 dark:bg-slate-700/80 rounded-md p-2 mb-2 shadow-sm hover:shadow-lg hover:border-blue-500 transition-all duration-200 ${dragClass}"
                 data-task-id="${task.docId}"
                 data-assignee-uid="${task.assigneeUid}">
                <div class="flex items-start justify-between">
                    <p class="font-semibold text-xs text-slate-700 dark:text-slate-200 leading-tight flex-grow pr-2">${task.title}</p>
                    <span class="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${style.color}" title="Prioridad: ${style.label}"></span>
                </div>
                <div class="flex items-end justify-between mt-1">
                    ${completeButton}
                    <span class="text-right text-[11px] text-slate-500 dark:text-slate-400">
                        ${assignee ? assignee.name.split(' ')[0] : 'N/A'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function renderWeeklyTasks(tasks) {
    const weeklyContainer = document.getElementById('weekly-tasks-container');
    const overdueContainer = document.querySelector('#overdue-tasks-container .task-list');
    const unscheduledContainer = document.querySelector('#unscheduled-tasks-container .task-list');

    if (!weeklyContainer || !overdueContainer || !unscheduledContainer) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const weekDates = getWeekDateRange(true);
    const mondayOfCurrentWeek = new Date(weekDates[0] + 'T00:00:00Z');

    const format = (d) => d.toISOString().split('T')[0];

    // Define date ranges for the next two weeks
    const nextWeekStart = new Date(mondayOfCurrentWeek);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 4);

    const followingWeekStart = new Date(mondayOfCurrentWeek);
    followingWeekStart.setDate(followingWeekStart.getDate() + 14);
    const followingWeekEnd = new Date(followingWeekStart);
    followingWeekEnd.setDate(followingWeekEnd.getDate() + 4);

    const tasksByDay = { day0: [], day1: [], day2: [], day3: [], day4: [] };
    const nextWeekTasks = [];
    const followingWeekTasks = [];
    const overdueTasks = [];
    const unscheduledTasks = [];

    tasks.forEach(task => {
        if (!task.dueDate) {
            unscheduledTasks.push(task);
        } else if (task.dueDate < todayStr) {
            overdueTasks.push(task);
        } else {
            const dueDate = new Date(task.dueDate + 'T00:00:00Z');
            const diffDays = (dueDate - mondayOfCurrentWeek) / (1000 * 60 * 60 * 24);

            if (diffDays >= 0 && diffDays < 5) {
                const dayIndex = dueDate.getUTCDay() - 1;
                if (dayIndex >= 0 && dayIndex < 5) {
                    tasksByDay[`day${dayIndex}`].push(task);
                }
            } else if (task.dueDate >= format(nextWeekStart) && task.dueDate <= format(nextWeekEnd)) {
                nextWeekTasks.push(task);
            } else if (task.dueDate >= format(followingWeekStart) && task.dueDate <= format(followingWeekEnd)) {
                followingWeekTasks.push(task);
            }
        }
    });

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    let dayColumnsHTML = dayNames.map((dayName, index) => {
        const dateForColumn = weekDates[index];
        return renderTaskColumn(dayName, tasksByDay[`day${index}`] || [], { 'data-date': dateForColumn });
    }).join('');

    dayColumnsHTML += renderTaskColumn('Semana Siguiente', nextWeekTasks, { 'data-column-type': 'next-week' });
    dayColumnsHTML += renderTaskColumn('Próxima Semana', followingWeekTasks, { 'data-column-type': 'following-week' });


    weeklyContainer.innerHTML = dayColumnsHTML;
    overdueContainer.innerHTML = renderTaskCardsHTML(overdueTasks);
    unscheduledContainer.innerHTML = renderTaskCardsHTML(unscheduledTasks);

    // Apply staggered animation to newly rendered cards
    const taskCards = document.querySelectorAll('.task-card-compact');
    taskCards.forEach((card, index) => {
        card.style.animationDelay = `${index * 50}ms`;
        card.classList.add('fade-in-up');
    });

    lucide.createIcons();
    initWeeklyTasksSortable();
}

function renderTaskColumn(title, tasks, attributes) {
    const taskCardsHTML = renderTaskCardsHTML(tasks);
    const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');

    // Do not render a title for the special columns, as they have their own styled header.
    const titleHTML = title ? `<h4 class="text-base font-bold text-center text-slate-600 dark:text-slate-300 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">${title}</h4>` : '';
    const columnClasses = title ? "bg-slate-50 dark:bg-slate-800 rounded-xl p-3" : "";


    return `
        <div class="${columnClasses}">
            ${titleHTML}
            <div class="task-list space-y-1 h-full" ${attrs}>
                ${taskCardsHTML}
            </div>
        </div>
    `;
}


function initWeeklyTasksSortable() {
    const taskLists = document.querySelectorAll('.task-list');
    if (taskLists.length === 0) return;

    // Get Monday of the current week to calculate future dates
    const today = new Date();
    today.setDate(today.getDate() + (appState.weekOffset * 7));
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const format = (d) => d.toISOString().split('T')[0];


    taskLists.forEach(list => {
        if (list.sortable) { // Destroy previous instance if it exists
            list.sortable.destroy();
        }
        new Sortable(list, {
            group: 'weekly-planning',
            animation: 150,
            filter: '.no-drag',
            onStart: function (evt) {
                document.querySelectorAll('.task-list').forEach(el => {
                    el.closest('.bg-slate-50, .bg-red-50, .bg-amber-50')?.classList.add('drop-target-highlight');
                });
            },
            onEnd: async (evt) => {
                document.querySelectorAll('.drop-target-highlight').forEach(el => {
                    el.classList.remove('drop-target-highlight');
                });

                const itemEl = evt.item;
                const taskId = itemEl.dataset.taskId;
                const newColumn = evt.to;
                const columnType = newColumn.dataset.columnType;

                let newDate;

                if (newColumn.dataset.date) {
                    newDate = newColumn.dataset.date;
                } else if (columnType === 'unscheduled') {
                    newDate = null; // Set dueDate to null
                } else if (columnType === 'next-week') {
                    const nextWeekMonday = new Date(monday);
                    nextWeekMonday.setDate(monday.getDate() + 7);
                    newDate = format(nextWeekMonday);
                } else if (columnType === 'following-week') {
                    const followingWeekMonday = new Date(monday);
                    followingWeekMonday.setDate(monday.getDate() + 14);
                    newDate = format(followingWeekMonday);
                } else if (columnType === 'overdue') {
                    showToast('No se puede arrastrar una tarea a la columna "Vencidas".', 'error');
                    refreshWeeklyTasksView(); // Revert visual change
                    return;
                } else {
                    console.error("Invalid drop target column:", newColumn);
                    refreshWeeklyTasksView();
                    return;
                }

                if (!taskId) {
                    console.error("Task ID is missing from dragged item.");
                    refreshWeeklyTasksView();
                    return;
                }

                try {
                    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
                    await updateDoc(taskRef, { dueDate: newDate });
                    showToast('Fecha de tarea actualizada.', 'success');
                    // The view will be refreshed by the real-time listener,
                    // but we can force it for immediate feedback.
                    refreshWeeklyTasksView();
                } catch (error) {
                    console.error("Error updating task dueDate:", error);
                    showToast('Error al actualizar la tarea.', 'error');
                    refreshWeeklyTasksView(); // Revert on error
                }
            }
        });
    });
}

// --- 3. LOGIC AND DATA FETCHING ---

/**
 * Fetches the counts for all KPI cards.
 */
async function fetchKpiData() {
    const kpiCollections = [
        { name: 'Proyectos', key: COLLECTIONS.PROYECTOS },
        { name: 'Productos', key: COLLECTIONS.PRODUCTOS },
        { name: 'Usuarios', key: COLLECTIONS.USUARIOS },
        { name: 'Insumos', key: COLLECTIONS.INSUMOS }
    ];
    const promises = kpiCollections.map(c => getCountFromServer(collection(db, c.key)));
    const snapshots = await Promise.all(promises);
    const kpiData = {};
    snapshots.forEach((snap, index) => {
        kpiData[kpiCollections[index].name] = snap.data().count;
    });
    return kpiData;
}

async function fetchWeeklyTasks() {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const todayStr = new Date().toISOString().split('T')[0];
    const user = appState.currentUser;

    // Query for tasks that are either public, assigned to the user, or created by the user.
    // Firestore's 'or' query allows combining these conditions.
    const q = query(
        tasksRef,
        or(
            where('isPublic', '==', true),
            where('creatorUid', '==', user.uid),
            where('assigneeUid', '==', user.uid)
        )
    );

    try {
        const querySnapshot = await getDocs(q);

        // Client-side filter to exclude 'done' tasks, as 'or' queries
        // cannot be combined with inequality filters like '!='.
        const allTasks = querySnapshot.docs
            .map(doc => ({ ...doc.data(), docId: doc.id }))
            .filter(task => task.status !== 'done');

        // Return all relevant, non-completed tasks for categorization.
        return allTasks;

    } catch (error) {
        console.error("Error fetching all relevant tasks:", error);
        if (error.code === 'failed-precondition') {
            showToast('Se necesita un índice de base de datos. Revise la consola para el enlace de creación.', 'error');
            console.error("Firestore index required. Please create it using the link in the browser console.");
        } else {
            showToast('Error al cargar las tareas.', 'error');
        }
        return []; // Return empty array on error
    }
}


/**
 * Updates the UI with the fetched KPI data.
 */
function updateKpiCards(kpiData) {
    document.querySelector('#kpi-proyectos p:nth-child(2)').textContent = kpiData.Proyectos || 0;
    document.querySelector('#kpi-productos p:nth-child(2)').textContent = kpiData.Productos || 0;
    document.querySelector('#kpi-usuarios p:nth-child(2)').textContent = kpiData.Usuarios || 0;
    document.querySelector('#kpi-insumos p:nth-child(2)').textContent = kpiData.Insumos || 0;
}

/**
 * Attaches event listeners to the database action buttons.
 */
function setupActionButtons() {
    const adminContainer = document.getElementById('admin-actions-container');
    if (appState.currentUser.isSuperAdmin) {
        adminContainer.style.display = 'block';
        document.getElementById('seed-db-btn')?.addEventListener('click', () => {
            showConfirmationModal('Poblar Base de Datos', '¿Estás seguro? Esto borrará todos los datos (excepto usuarios) y los reemplazará con los datos de demostración.', seedDatabase);
        });
        document.getElementById('clear-data-btn')?.addEventListener('click', () => {
            showConfirmationModal('Borrar Solo Datos', '¿Estás seguro? Esto borrará todos los datos de productos, insumos, etc., pero mantendrá a todos los usuarios.', clearDataOnly);
        });
        document.getElementById('clear-users-btn')?.addEventListener('click', () => {
             showConfirmationModal('Borrar Otros Usuarios', '¿Estás seguro? Esto eliminará a TODOS los usuarios excepto al administrador principal. Esta acción es irreversible.', clearOtherUsers);
        });
    } else {
        adminContainer.style.display = 'none';
    }

    document.getElementById('ai-analyst-btn')?.addEventListener('click', async () => {
        if (weeklyTasksCache.length === 0) {
            showToast('No hay tareas para analizar.', 'info');
            return;
        }

        const modalElement = showAIAnalysisModal();
        const contentContainer = modalElement.querySelector('#ai-analysis-content');
        const applyPlanBtn = modalElement.querySelector('#apply-ai-plan-btn');

        try {
            const analyzeWeeklyTasks = httpsCallable(functions, 'analyzeWeeklyTasks');
            const result = await analyzeWeeklyTasks({ tasks: weeklyTasksCache, weekOffset: appState.weekOffset });

            const { plan, analysis } = result.data;

            if (analysis) {
                contentContainer.innerHTML = marked.parse(analysis);
            } else {
                throw new Error("La respuesta de la IA no incluyó un análisis.");
            }

            if (plan && plan.length > 0) {
                applyPlanBtn.disabled = false;
                applyPlanBtn.addEventListener('click', async () => {
                    applyPlanBtn.disabled = true;
                    applyPlanBtn.innerHTML = `<i data-lucide="loader" class="animate-spin w-5 h-5"></i> Aplicando...`;
                    lucide.createIcons();

                    try {
                        const batch = writeBatch(db);
                        plan.forEach(taskUpdate => {
                            const taskRef = doc(db, COLLECTIONS.TAREAS, taskUpdate.taskId);
                            batch.update(taskRef, { dueDate: taskUpdate.newDueDate });
                        });
                        await batch.commit();
                        showToast('¡Plan semanal aplicado con éxito!', 'success');
                        modalElement.remove();
                        refreshWeeklyTasksView();
                    } catch (e) {
                        console.error("Error applying AI plan:", e);
                        showToast('Error al aplicar el plan sugerido.', 'error');
                        applyPlanBtn.disabled = false;
                        applyPlanBtn.innerHTML = `<i data-lucide="check-check" class="w-5 h-5"></i> Aplicar Plan Sugerido`;
                        lucide.createIcons();
                    }
                }, { once: true });
            }

        } catch (error) {
            console.error("Error calling analyzeWeeklyTasks function:", error);
            showToast('Error al contactar al Analista IA.', 'error');
            contentContainer.innerHTML = `<p class="text-red-500 p-4">Ocurrió un error al generar el análisis. Por favor, intente de nuevo.</p>`;
        }
    });

    document.getElementById('add-new-dashboard-task-btn')?.addEventListener('click', () => {
        if (openTaskFormModal) {
            openTaskFormModal(null, 'todo'); // Open new task modal with default status
        } else {
            console.error("openTaskFormModal function is not available.");
            showToast("Error: No se puede abrir el formulario de tareas.", "error");
        }
    });

    document.getElementById('prev-week-btn')?.addEventListener('click', () => {
        appState.weekOffset--;
        refreshWeeklyTasksView('prev');
    });

    document.getElementById('next-week-btn')?.addEventListener('click', () => {
        appState.weekOffset++;
        refreshWeeklyTasksView('next');
    });

    const weeklyTasksContainer = document.getElementById('weekly-tasks-container');
    weeklyTasksContainer?.addEventListener('click', async (e) => {
        const completeButton = e.target.closest('[data-action="complete-task"]');
        if (completeButton) {
            e.stopPropagation(); // Prevent the modal from opening
            const taskCard = completeButton.closest('.task-card-compact');
            const taskId = taskCard.dataset.taskId;
            if (!taskId) return;

            try {
                const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
                await updateDoc(taskRef, { status: 'done' });
                showToast('Tarea completada.', 'success');

                taskCard.style.transition = 'opacity 0.3s, transform 0.3s, height 0.3s, padding 0.3s, margin 0.3s';
                taskCard.style.opacity = '0';
                taskCard.style.transform = 'scale(0.95)';
                taskCard.style.height = '0px';
                taskCard.style.padding = '0';
                taskCard.style.margin = '0';

                setTimeout(() => {
                    taskCard.remove();
                    // Check if column is empty and show placeholder
                    const column = taskCard.parentElement;
                    if (column && column.children.length === 0) {
                         column.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 text-center pt-4">No hay tareas</p>`;
                    }
                }, 300);

            } catch (error) {
                console.error("Error completing task:", error);
                showToast('Error al completar la tarea.', 'error');
            }
            return;
        }

        // To prevent the modal from opening when a drag is initiated.
        if (e.target.closest('.sortable-drag')) {
            return;
        }

        const taskCard = e.target.closest('.task-card-compact');
        if (taskCard) {
            const taskId = taskCard.dataset.taskId;
            const task = weeklyTasksCache.find(t => t.docId === taskId);
            if (task) {
                openTaskFormModal(task);
            }
        }
    });
}

// --- 4. MAIN AND INITIALIZATION ---

async function refreshWeeklyTasksView(direction = 'next') {
    const weekInfo = getWeekInfo(appState.weekOffset);
    const weekDisplay = document.getElementById('week-display');
    if (weekDisplay) {
        weekDisplay.textContent = `Semana ${weekInfo.weekNumber} - ${weekInfo.monthName} ${weekInfo.year}`;
    }

    const container = document.getElementById('weekly-tasks-container');
    if (!container) return;

    const slideOutClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const slideInClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

    // 1. Apply slide-out animation
    container.classList.add(slideOutClass);

    // 2. Wait for animation to end
    container.addEventListener('animationend', async function onAnimationEnd() {
        // Remove this listener to prevent it from firing again
        container.removeEventListener('animationend', onAnimationEnd);

        try {
            // 3. Fetch and render new content
            const tasks = await fetchWeeklyTasks();
            weeklyTasksCache = tasks;
            renderWeeklyTasks(tasks); // This will remove the old content and classes

            // 4. Apply slide-in animation to the new content
            const newContainer = document.getElementById('weekly-tasks-container');
            if (newContainer) {
                 // We need to remove the slide-out class before adding the slide-in one
                newContainer.classList.remove(slideOutClass);
                newContainer.classList.add(slideInClass);

                // 5. Clean up the slide-in class after it finishes
                newContainer.addEventListener('animationend', () => {
                    newContainer.classList.remove(slideInClass);
                }, { once: true });
            }
        } catch (error) {
            console.error("Error refreshing weekly tasks view:", error);
            showToast('Error al actualizar la vista de tareas.', 'error');
            // In case of error, remove animation classes to unhide the container
            container.classList.remove(slideOutClass, slideInClass);
        }
    }, { once: true });
}

/**
 * Main logic runner for the landing page.
 */
export async function runLandingPageLogic() {
    console.log("runLandingPageLogic called.");
    appState.weekOffset = 0; // Reset on view load
    renderLandingPageHTML();

    try {
        // Fetch KPI data separately
        const kpiData = await fetchKpiData();
        updateKpiCards(kpiData);

        // Perform the initial render of the weekly tasks view
        await refreshWeeklyTasksView();

    } catch (error) {
        console.error("Error loading landing page data:", error);
        showToast("Error al cargar los datos del dashboard.", "error");
        if (dom && dom.viewContent) {
            dom.viewContent.innerHTML = '<p class="text-red-500 p-8 text-center">Ocurrió un error al cargar la página de inicio. Por favor, revise la consola.</p>';
        }
    }

    setupActionButtons();
}

/**
 * Initializes the module by injecting dependencies from main.js.
 * @param {object} dependencies - The dependencies object.
 */
export function initLandingPageModule(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    showToast = dependencies.showToast;
    openTaskFormModal = dependencies.openTaskFormModal;
    functions = dependencies.functions;

    // Injecting functions from main.js to be called from the landing page
    seedDatabase = dependencies.seedDatabase;
    clearDataOnly = dependencies.clearDataOnly;
    clearOtherUsers = dependencies.clearOtherUsers;
    console.log("Landing Page Module Initialized.");
}

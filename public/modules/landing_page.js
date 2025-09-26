import { collection, getCountFromServer, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from '../utils.js';

// --- 1. DEPENDENCIES AND STATE ---
let db;
let appState;
let dom;
let lucide;
let showToast;
let openTaskFormModal;

// Functions from main.js to be injected
let seedDatabase;
let clearDataOnly;
let clearOtherUsers;

// --- 2. UI RENDERING ---

/**
 * Renders the main HTML structure of the new landing page.
 */
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
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">Tareas Semanales de Ingeniería</h3>
                        <button id="add-new-dashboard-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                            <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea
                        </button>
                    </div>
                    <div id="weekly-tasks-container" class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 min-h-[400px]">
                        <!-- Day columns will be injected here -->
                    </div>
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

function getWeekDateRange() {
    const today = new Date();
    const day = today.getDay(); // Sunday - 0, Monday - 1, ...
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today.setDate(today.getDate() + diffToMonday));
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    const format = (date) => date.toISOString().split('T')[0];
    return { start: format(monday), end: format(friday) };
}

function renderWeeklyTasks(tasks) {
    const container = document.getElementById('weekly-tasks-container');
    if (!container) return;

    const users = appState.collectionsById.usuarios || new Map();
    const priorityStyles = {
        high: { label: 'Alta', icon: 'chevrons-up', color: 'text-red-500' },
        medium: { label: 'Media', icon: 'equal', color: 'text-yellow-500' },
        low: { label: 'Baja', icon: 'chevrons-down', color: 'text-green-500' }
    };
    const statusColors = {
        todo: 'bg-gray-400',
        inprogress: 'bg-blue-500',
        done: 'bg-green-500'
    };

    const weekDates = getWeekDateRange(true);

    const tasksByDay = Array(5).fill(null).map(() => []);
    tasks.forEach(task => {
        if (task.dueDate) {
            const date = new Date(task.dueDate + 'T00:00:00Z');
            const dayIndex = date.getUTCDay() - 1;
            if (dayIndex >= 0 && dayIndex < 5) {
                tasksByDay[dayIndex].push(task);
            }
        }
    });

    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    container.innerHTML = dayNames.map((dayName, index) => {
        const tasks = tasksByDay[index];
        const dateForColumn = weekDates[index];

        const taskCards = tasks.length > 0 ? tasks.map(task => {
            const assignee = users.get(task.assigneeUid);
            const priority = task.priority || 'medium';
            const style = priorityStyles[priority];
            const canDrag = appState.currentUser.role === 'admin' || appState.currentUser.uid === task.assigneeUid;
            const dragClass = canDrag ? 'cursor-grab' : 'no-drag';

            return `
                <div class="task-card border bg-white/50 dark:bg-slate-700/50 rounded-lg p-3 mb-3 shadow-sm hover:shadow-md transition-shadow duration-200 ${dragClass}"
                     data-task-id="${task.docId}"
                     data-assignee-uid="${task.assigneeUid}">
                    <div class="flex justify-between items-start">
                        <p class="font-semibold text-sm text-slate-700 dark:text-slate-200 leading-tight">${task.title}</p>
                        <span class="flex-shrink-0 ml-2 w-5 h-5 rounded-full ${statusColors[task.status] || 'bg-gray-300'}" title="Estado: ${task.status}"></span>
                    </div>
                    <div class="flex items-center justify-between text-xs mt-2 text-slate-500 dark:text-slate-400">
                        <span class="flex items-center">
                            <i data-lucide="${style.icon}" class="w-3.5 h-3.5 mr-1 ${style.color}"></i>
                            Prioridad: ${style.label}
                        </span>
                        <span>${assignee ? assignee.name.split(' ')[0] : 'N/A'}</span>
                    </div>
                </div>
            `;
        }).join('') : '<p class="text-sm text-slate-400 dark:text-slate-500 text-center pt-4">No hay tareas</p>';

        return `
            <div class="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                <h4 class="text-lg font-bold text-center text-slate-600 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">${dayName}</h4>
                <div class="task-list space-y-2 h-96 overflow-y-auto custom-scrollbar pr-1" data-date="${dateForColumn}">
                    ${taskCards}
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
    initWeeklyTasksSortable();
}

function initWeeklyTasksSortable() {
    const taskLists = document.querySelectorAll('#weekly-tasks-container .task-list');
    if (taskLists.length === 0) return;

    taskLists.forEach(list => {
        new Sortable(list, {
            group: 'weekly-tasks',
            animation: 150,
            filter: '.no-drag',
            onEnd: async (evt) => {
                const itemEl = evt.item;
                const taskId = itemEl.dataset.taskId;
                const newDate = evt.to.dataset.date;

                if (!taskId || !newDate) {
                    console.error("Task ID or new date is missing.");
                    return;
                }

                try {
                    const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
                    await updateDoc(taskRef, {
                        dueDate: newDate
                    });
                    showToast('Tarea actualizada.', 'success');
                } catch (error) {
                    console.error("Error updating task dueDate:", error);
                    showToast('Error al actualizar la tarea.', 'error');
                    fetchWeeklyTasks().then(renderWeeklyTasks);
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
    const { start, end } = getWeekDateRange();

    const q = query(
        tasksRef,
        where('isPublic', '==', true),
        where('dueDate', '>=', start),
        where('dueDate', '<=', end),
        orderBy('dueDate', 'asc')
    );

    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
    } catch (error) {
        console.error("Error fetching weekly tasks:", error);
        // Check if it's an index error
        if (error.code === 'failed-precondition') {
            showToast('Se necesita un índice de base de datos para las tareas semanales. Revise la consola.', 'error');
            console.error("Firestore index missing. Please create it. The error message should contain a link to create it automatically.");
        } else {
            showToast('Error al cargar las tareas de la semana.', 'error');
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

    document.getElementById('add-new-dashboard-task-btn')?.addEventListener('click', () => {
        if (openTaskFormModal) {
            openTaskFormModal(null, 'todo'); // Open new task modal with default status
        } else {
            console.error("openTaskFormModal function is not available.");
            showToast("Error: No se puede abrir el formulario de tareas.", "error");
        }
    });
}

// --- 4. MAIN AND INITIALIZATION ---

/**
 * Main logic runner for the landing page.
 */
export async function runLandingPageLogic() {
    console.log("runLandingPageLogic called.");
    renderLandingPageHTML();

    try {
        // Use Promise.allSettled to allow parts of the page to load even if one promise fails
        const results = await Promise.allSettled([
            fetchKpiData(),
            fetchWeeklyTasks()
        ]);

        const kpiDataResult = results[0];
        const weeklyTasksResult = results[1];

        if (kpiDataResult.status === 'fulfilled') {
            updateKpiCards(kpiDataResult.value);
        } else {
            console.error("Failed to fetch KPI data:", kpiDataResult.reason);
        }

        if (weeklyTasksResult.status === 'fulfilled') {
            renderWeeklyTasks(weeklyTasksResult.value);
        } else {
            console.error("Failed to fetch weekly tasks:", weeklyTasksResult.reason);
            const container = document.getElementById('weekly-tasks-container');
            if (container) {
                container.innerHTML = '<p class="text-red-500 text-center col-span-5">Error al cargar las tareas de la semana.</p>';
            }
        }

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

    // Injecting functions from main.js to be called from the landing page
    seedDatabase = dependencies.seedDatabase;
    clearDataOnly = dependencies.clearDataOnly;
    clearOtherUsers = dependencies.clearOtherUsers;
    console.log("Landing Page Module Initialized.");
}

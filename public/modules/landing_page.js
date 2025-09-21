import { collection, getCountFromServer, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { COLLECTIONS } from '../utils.js';

// --- 1. DEPENDENCIES AND STATE ---
let db;
let appState;
let dom;
let lucide;
let showToast;

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

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div class="lg:col-span-2 bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-semibold text-text-light dark:text-text-dark">Rendimiento de Tareas (Últimos 12 Meses)</h3>
                    </div>
                    <div class="h-96">
                        <canvas id="performanceChart"></canvas>
                    </div>
                </div>
                <div class="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-sm flex flex-col">
                    <h3 class="text-lg font-semibold mb-4 text-text-light dark:text-text-dark">Tareas con Vencimiento Próximo</h3>
                    <div id="upcoming-tasks-container" class="space-y-4 overflow-y-auto flex-1">
                        <p class="text-secondary-light text-center py-4">Cargando tareas...</p>
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

/**
 * Renders the performance chart with the given data.
 * @param {object} chartData - Data for the chart.
 */
function renderPerformanceChart(chartData) {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    const isDarkMode = document.documentElement.classList.contains('dark');
    const textColor = isDarkMode ? '#f9fafb' : '#1f2937';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Tareas Completadas',
                data: chartData.data,
                backgroundColor: 'rgba(0, 82, 204, 0.8)', // App's primary blue
                borderColor: 'rgba(0, 82, 204, 1)',
                borderWidth: 2,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(0, 82, 204, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDarkMode ? '#2d3748' : '#ffffff', // card-dark, card-light
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isDarkMode ? '#4a5568' : '#dfe1e6', // border-dark, border-light
                    borderWidth: 1,
                }
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { color: gridColor } },
                y: {
                    beginAtZero: true,
                    ticks: { color: textColor, precision: 0 },
                    grid: { color: gridColor },
                    title: {
                        display: true,
                        text: 'Cantidad de Tareas Completadas',
                        color: textColor,
                        font: { size: 14, weight: 'bold' }
                    }
                }
            }
        }
    });
}

/**
 * Renders the list of upcoming tasks.
 * @param {Array<object>} tasks - The tasks to render.
 */
function renderUpcomingTasks(tasks) {
    const container = document.getElementById('upcoming-tasks-container');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-secondary-light text-center py-4">No hay tareas con vencimiento próximo.</p>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getTaskHTML = (task) => {
        const dueDate = new Date(task.dueDate + 'T00:00:00');
        const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

        let dateText, dateClass, icon, borderColor;
        if (diffDays < 0) {
            dateText = `Vencida hace ${-diffDays} días`;
            dateClass = 'text-red-600 dark:text-red-400';
            icon = 'event_busy';
            borderColor = 'border-red-500';
        } else if (diffDays === 0) {
            dateText = 'Vence: Hoy';
            dateClass = 'text-red-600 dark:text-red-400';
            icon = 'event_busy';
            borderColor = 'border-red-500';
        } else if (diffDays === 1) {
            dateText = 'Vence: Mañana';
            dateClass = 'text-amber-600 dark:text-amber-400';
            icon = 'event_upcoming';
            borderColor = 'border-amber-500';
        } else {
            dateText = `Vence: En ${diffDays} días`;
            dateClass = 'text-secondary-light dark:text-secondary-dark';
            icon = 'event';
            borderColor = 'border-blue-500';
        }

        return `
            <div class="flex items-start gap-3 p-3 rounded-lg bg-background-light dark:bg-card-dark border-l-4 ${borderColor}">
                <i data-lucide="${icon === 'event_busy' ? 'calendar-x' : (icon === 'event_upcoming' ? 'calendar-clock' : 'calendar')}" class="${dateClass} mt-1 h-5 w-5"></i>
                <div>
                    <p class="font-medium text-text-light dark:text-text-dark">${task.title}</p>
                    <p class="text-sm font-semibold ${dateClass}">${dateText}</p>
                </div>
            </div>
        `;
    };

    container.innerHTML = tasks.map(getTaskHTML).join('');
    lucide.createIcons();
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

/**
 * Fetches and processes task data for the performance chart.
 */
async function getPerformanceChartData() {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const q = query(tasksRef, where('status', '==', 'done'));
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => doc.data());

    const monthlyCounts = Array(12).fill(0);
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    tasks.forEach(task => {
        const completedDate = task.updatedAt?.toDate ? task.updatedAt.toDate() : null;
        if (completedDate && completedDate >= oneYearAgo) {
            const month = completedDate.getMonth();
            monthlyCounts[month]++;
        }
    });

    const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    // Rotate array to have the current month last
    const currentMonth = now.getMonth();
    const rotatedLabels = [...monthLabels.slice(currentMonth + 1), ...monthLabels.slice(0, currentMonth + 1)];
    const rotatedData = [...monthlyCounts.slice(currentMonth + 1), ...monthlyCounts.slice(0, currentMonth + 1)];

    return { labels: rotatedLabels, data: rotatedData };
}

/**
 * Fetches the most urgent tasks for the current user.
 */
async function fetchUpcomingTasks() {
    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const today = new Date().toISOString().split('T')[0];
    const q = query(
        tasksRef,
        where('assigneeUid', '==', appState.currentUser.uid),
        where('dueDate', '>=', today),
        orderBy('dueDate', 'asc'),
        limit(10) // Fetch more to filter on the client
    );
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map(doc => ({...doc.data(), docId: doc.id }));

    // Filter out completed tasks on the client and get the top 5
    return tasks.filter(t => t.status !== 'done').slice(0, 5);
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
            getPerformanceChartData(),
            fetchUpcomingTasks()
        ]);

        const kpiDataResult = results[0];
        const chartDataResult = results[1];
        const upcomingTasksResult = results[2];

        if (kpiDataResult.status === 'fulfilled') {
            updateKpiCards(kpiDataResult.value);
        } else {
            console.error("Failed to fetch KPI data:", kpiDataResult.reason);
        }

        if (chartDataResult.status === 'fulfilled') {
            renderPerformanceChart(chartDataResult.value);
        } else {
            console.error("Failed to fetch chart data:", chartDataResult.reason);
        }

        if (upcomingTasksResult.status === 'fulfilled') {
            renderUpcomingTasks(upcomingTasksResult.value);
        } else {
            console.error("Failed to fetch upcoming tasks:", upcomingTasksResult.reason);
            document.getElementById('upcoming-tasks-container').innerHTML = '<p class="text-red-500 text-center text-sm">Error al cargar tareas: Se requiere un índice de Firestore.</p>';
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

    // Injecting functions from main.js to be called from the landing page
    seedDatabase = dependencies.seedDatabase;
    clearDataOnly = dependencies.clearDataOnly;
    clearOtherUsers = dependencies.clearOtherUsers;
    console.log("Landing Page Module Initialized.");
}

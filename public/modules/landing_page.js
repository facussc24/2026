import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { openTaskFormModal } from './tasks/task.modal.js';

// --- 1. DEPENDENCIES AND STATE ---
let db;
let appState;
let dom;
let lucide;
let showToast;
let openAIAssistantModal;
let allUserTasks = []; // Cache for tasks to avoid re-fetching

// --- 2. UI RENDERING ---

function renderCommandCenterHTML() {
    dom.viewContent.innerHTML = `
        <div id="command-center-container" class="animate-fade-in-up space-y-8">

            <!-- Header and AI Button -->
            <div class="flex flex-col md:flex-row justify-between items-center gap-4 p-6 bg-card-light dark:bg-card-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark">
                <div>
                    <h2 class="text-3xl font-bold text-slate-800 dark:text-slate-200">Centro de Comando</h2>
                    <p class="text-slate-500 dark:text-slate-400 mt-1">Tu resumen diario de prioridades. ¡Manos a la obra!</p>
                </div>
                <button id="open-ai-assistant-btn" class="w-full md:w-auto bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-3 shadow-lg transition-transform transform hover:scale-105">
                    <i data-lucide="sparkles" class="w-6 h-6"></i>
                    <span class="text-lg font-semibold">Accionar Asistente IA</span>
                </button>
            </div>

            <!-- Task Lists -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Overdue Tasks -->
                <div class="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl shadow-md">
                    <h3 class="font-bold text-red-700 dark:text-red-300 mb-4 flex items-center gap-3 text-lg">
                        <i data-lucide="alert-octagon" class="w-6 h-6"></i>
                        Tareas Vencidas
                    </h3>
                    <div id="overdue-tasks-list" class="task-list space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                        <p class="text-sm text-slate-500 text-center py-4">Cargando...</p>
                    </div>
                </div>

                <!-- Today's Tasks -->
                <div class="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl shadow-md">
                    <h3 class="font-bold text-blue-700 dark:text-blue-300 mb-4 flex items-center gap-3 text-lg">
                        <i data-lucide="calendar-check-2" class="w-6 h-6"></i>
                        Tareas para Hoy
                    </h3>
                    <div id="today-tasks-list" class="task-list space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                        <p class="text-sm text-slate-500 text-center py-4">Cargando...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

function renderTaskItemHTML(task) {
    const assignee = appState.collectionsById.usuarios?.get(task.assigneeUid);
    const priorityClasses = {
        high: 'border-red-500',
        medium: 'border-yellow-500',
        low: 'border-slate-300',
    };
    const priorityBorder = priorityClasses[task.priority] || 'border-slate-300';
    const descriptionHTML = task.description ? `<p class="text-sm text-slate-600 dark:text-slate-400 mt-1">${task.description}</p>` : '';

    return `
        <div class="task-card-item bg-white dark:bg-slate-800 p-4 rounded-lg border-l-4 ${priorityBorder} shadow-sm hover:shadow-md transition-shadow cursor-pointer" data-task-id="${task.docId}">
            <div class="flex justify-between items-start">
                <p class="font-bold text-slate-800 dark:text-slate-200 flex-grow pr-4">${task.title}</p>
                ${assignee ? `<img src="${assignee.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(assignee.name)}`}" title="Asignada a: ${assignee.name}" class="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white dark:border-slate-700">` : ''}
            </div>
            ${descriptionHTML}
        </div>
    `;
}

async function fetchAndRenderTasks() {
    const today = new Date().toISOString().split('T')[0];
    const user = appState.currentUser;
    if (!user) return;

    const tasksRef = collection(db, 'tareas');
    const overdueListEl = document.getElementById('overdue-tasks-list');
    const todayListEl = document.getElementById('today-tasks-list');

    const overdueQuery = query(tasksRef,
        where('assigneeUid', '==', user.uid),
        where('status', '!=', 'done'),
        where('dueDate', '<', today)
    );

    const todayQuery = query(tasksRef,
        where('assigneeUid', '==', user.uid),
        where('status', '!=', 'done'),
        where('dueDate', '==', today)
    );

    try {
        const [overdueSnapshot, todaySnapshot] = await Promise.all([
            getDocs(overdueQuery),
            getDocs(todayQuery)
        ]);

        const overdueTasks = overdueSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        const todayTasks = todaySnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        allUserTasks = [...overdueTasks, ...todayTasks];

        if (overdueListEl) {
            overdueListEl.innerHTML = overdueTasks.length > 0 ? overdueTasks.map(renderTaskItemHTML).join('') : '<p class="text-sm text-slate-500 text-center py-4">¡Ninguna tarea vencida! Buen trabajo.</p>';
        }
        if (todayListEl) {
            todayListEl.innerHTML = todayTasks.length > 0 ? todayTasks.map(renderTaskItemHTML).join('') : '<p class="text-sm text-slate-500 text-center py-4">¡Día libre! No hay tareas para hoy.</p>';
        }

        lucide.createIcons();
    } catch (error) {
        console.error("Error fetching tasks for command center:", error);
        showToast("Error al cargar las tareas del día.", "error");
        if(overdueListEl) overdueListEl.innerHTML = '<p class="text-red-500 text-center py-4">Error al cargar tareas.</p>';
        if(todayListEl) todayListEl.innerHTML = '<p class="text-red-500 text-center py-4">Error al cargar tareas.</p>';
    }
}

function setupCommandCenterListeners() {
    const container = dom.viewContent;

    const aiButton = container.querySelector('#open-ai-assistant-btn');
    if (aiButton) {
        aiButton.addEventListener('click', () => {
            openAIAssistantModal();
        });
    }

    container.addEventListener('click', (e) => {
        const card = e.target.closest('.task-card-item');
        if (card && card.dataset.taskId) {
            const task = allUserTasks.find(t => t.docId === card.dataset.taskId);
            if (task) {
                openTaskFormModal(task);
            } else {
                showToast('No se pudieron cargar los detalles de la tarea.', 'error');
            }
        }
    });
}


export async function runLandingPageLogic() {
    renderCommandCenterHTML();
    await fetchAndRenderTasks();
    setupCommandCenterListeners();
}

export function initLandingPageModule(dependencies) {
    db = dependencies.db;
    appState = dependencies.appState;
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    showToast = dependencies.showToast;
    openAIAssistantModal = dependencies.openAIAssistantModal;
}
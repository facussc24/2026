import { initTaskState } from './task.state.js';
import { initTaskService } from './task.service.js';
import { initTaskUI, renderMyPendingTasksWidget, renderTasksByProjectChart } from './task.ui.js';
import { initKanban, runKanbanBoardLogic } from './task.kanban.js';
import { initDashboard, renderTaskDashboardView } from './task.dashboard.js';
import { initCalendar, renderTaskCalendar } from './task.calendar.js';
import { calculateOverdueTasksCount, fetchAllTasks } from './task.service.js';

let dom;
let lucide;

// Exported functions for other modules to use
export {
    calculateOverdueTasksCount,
    fetchAllTasks,
    renderMyPendingTasksWidget,
    renderTasksByProjectChart
};

export function initTasksModule(dependencies) {
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    initTaskState(dependencies);
    initTaskService(dependencies);
    initTaskUI(dependencies);
    initKanban(dependencies);
    initDashboard(dependencies);
    initCalendar(dependencies);
    console.log("Tasks module initialized.");
}

export function runTasksLogic(initialView = 'kanban') {
    const renderView = (view) => {
        const viewContainer = dom.viewContent.querySelector('#task-view-container');
        if (!viewContainer) return;
        viewContainer.innerHTML = ''; // Clear previous view

        dom.viewContent.querySelectorAll('.task-nav-btn').forEach(btn => {
            btn.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
            btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
        });

        const activeButton = dom.viewContent.querySelector(`.task-nav-btn[data-task-view="${view}"]`);
        if (activeButton) {
            activeButton.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
            activeButton.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
        }

        if (view === 'dashboard') {
            renderTaskDashboardView(viewContainer);
        } else if (view === 'calendar') {
            renderTaskCalendar(viewContainer);
        } else if (view === 'kanban') {
            runKanbanBoardLogic(viewContainer);
        }
    };

    dom.viewContent.innerHTML = `
        <div id="task-main-container" class="space-y-4">
             <div class="flex flex-wrap justify-between items-center gap-4 mb-2">
                 <h2 class="text-3xl font-bold text-slate-800">Gestor de Tareas</h2>
                 <nav id="task-navigation" class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                     <button data-task-view="kanban" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors">
                         <i data-lucide="columns" class="w-4 h-4 mr-1.5"></i>Mis Tareas
                     </button>
                     <button data-task-view="dashboard" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors">
                         <i data-lucide="layout-dashboard" class="w-4 h-4 mr-1.5"></i>Dashboard
                     </button>
                     <button data-task-view="calendar" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors">
                         <i data-lucide="calendar" class="w-4 h-4 mr-1.5"></i>Calendario
                     </button>
                 </nav>
             </div>
             <div id="task-view-container" class="mt-4">
                 <!-- Content for the selected view will be rendered here -->
             </div>
         </div>
    `;

    const taskNav = dom.viewContent.querySelector('#task-navigation');
    if (taskNav) {
        taskNav.addEventListener('click', (e) => {
            const button = e.target.closest('.task-nav-btn');
            if (button && button.dataset.taskView) {
                renderView(button.dataset.taskView);
            }
        });
    }

    // Render the initial view passed to the function
    renderView(initialView);
    if (lucide) {
        lucide.createIcons();
    }
}

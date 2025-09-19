import { getState, initTaskState } from './task.state.js';
import { initTaskService } from './task.service.js';
import { initTaskUI, renderMyPendingTasksWidget, renderTasksByProjectChart } from './task.ui.js';
import { initKanban, runKanbanBoardLogic } from './task.kanban.js';
import { initDashboard, renderTaskDashboardView } from './task.dashboard.js';
import { initCalendar } from './task.calendar.js';
import { calculateOverdueTasksCount, fetchAllTasks } from './task.service.js';

// Module-level variables to hold dependencies
let dom, lucide;

// Exported functions for other modules to use
export {
    calculateOverdueTasksCount,
    fetchAllTasks,
    renderMyPendingTasksWidget,
    renderTasksByProjectChart,
    renderTaskDashboardView
};

export function initTasksModule(dependencies) {
    // Store dependencies for use within this module
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

export function runTasksLogic() {
    const renderView = (view) => {
        // Clear previous content and remove active state from all buttons
        const viewContainer = document.getElementById('task-view-container');
        if (!viewContainer) return;
        viewContainer.innerHTML = '';
        document.querySelectorAll('.task-nav-btn').forEach(btn => btn.classList.remove('active'));

        // Set the new view as active
        const activeButton = document.querySelector(`.task-nav-btn[data-view="${view}"]`);
        if (activeButton) activeButton.classList.add('active');

        // Render the selected view
        if (view === 'dashboard') {
            renderTaskDashboardView(viewContainer);
        } else if (view === 'calendar') {
            // Calendar logic needs a container, let's provide one.
            viewContainer.innerHTML = `<div id="calendar-container" class="bg-white p-6 rounded-xl shadow-lg"></div>`;
            renderCalendar(new Date(), 'monthly'); // Or some default state
        } else if (view === 'kanban') {
            runKanbanBoardLogic(viewContainer);
        }
    };

    // Set up the main structure for the tasks view
    dom.viewContent.innerHTML = `
        <div id="task-main-container" class="space-y-4">
            <div class="flex flex-wrap justify-between items-center gap-4 mb-2">
                <h2 class="text-3xl font-bold text-slate-800">Gestor de Tareas</h2>
                <nav id="task-navigation" class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                    <button data-view="dashboard" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors text-slate-600 hover:bg-slate-300/50">
                        <i data-lucide="layout-dashboard"></i> Dashboard
                    </button>
                    <button data-view="calendar" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors text-slate-600 hover:bg-slate-300/50">
                        <i data-lucide="calendar"></i> Calendario
                    </button>
                    <button data-view="kanban" class="task-nav-btn flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-md transition-colors text-slate-600 hover:bg-slate-300/50">
                        <i data-lucide="columns"></i> Kanban
                    </button>
                </nav>
            </div>
            <div id="task-view-container">
                <!-- Content for the selected view will be rendered here -->
            </div>
        </div>
    `;

    // Add event listeners to the navigation buttons
    const taskNav = document.getElementById('task-navigation');
    if (taskNav) {
        taskNav.addEventListener('click', (e) => {
            const button = e.target.closest('.task-nav-btn');
            if (button && button.dataset.view) {
                renderView(button.dataset.view);
            }
        });
    }

    // Initial render
    renderView('dashboard');
    lucide.createIcons();
}

import { initTaskState } from './task.state.js';
import { initTaskService } from './task.service.js';
import { initTaskUI, renderMyPendingTasksWidget, renderTasksByProjectChart, openTelegramConfigModal } from './task.ui.js';
import { initTaskModal } from './task.modal.js';
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
    renderTasksByProjectChart,
    renderTaskDashboardView
};

export function initTasksModule(dependencies) {
    dom = dependencies.dom;
    lucide = dependencies.lucide;
    initTaskState(dependencies);
    initTaskService(dependencies);
    initTaskUI(dependencies);
    initTaskModal(dependencies);
    initKanban(dependencies);
    initDashboard(dependencies);
    initCalendar(dependencies);
    console.log("Tasks module initialized.");
}

export function runTasksLogic(initialView = 'dashboard') {
    const renderView = (view) => {
        const viewContainer = dom.viewContent.querySelector('#task-view-container');
        if (!viewContainer) return;
        viewContainer.innerHTML = ''; // Clear previous view

        // New class handling for navigation buttons
        dom.viewContent.querySelectorAll('.task-nav-btn').forEach(btn => {
            btn.classList.remove('bg-white', 'dark:bg-gray-800', 'text-primary-DEFAULT', 'shadow-sm');
            btn.classList.add('text-text-secondary-light', 'dark:text-text-secondary-dark', 'hover:bg-gray-300', 'dark:hover:bg-gray-600');
        });

        const activeButton = dom.viewContent.querySelector(`.task-nav-btn[data-task-view="${view}"]`);
        if (activeButton) {
            activeButton.classList.add('bg-white', 'dark:bg-gray-800', 'text-primary-DEFAULT', 'shadow-sm');
            activeButton.classList.remove('text-text-secondary-light', 'dark:text-text-secondary-dark', 'hover:bg-gray-300', 'dark:hover:bg-gray-600');
        }

        const dashboardFilters = dom.viewContent.querySelector('#dashboard-filters');
        if (dashboardFilters) {
            dashboardFilters.classList.toggle('hidden', view !== 'dashboard');
        }

        if (view === 'dashboard') {
            // The container for the dashboard view is the view-container itself
            renderTaskDashboardView(viewContainer);
        } else if (view === 'calendar') {
            renderTaskCalendar(viewContainer);
        } else if (view === 'kanban') {
            runKanbanBoardLogic(viewContainer);
        }
    };

    dom.viewContent.innerHTML = `
        <div id="task-main-container">
            <div class="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm mb-8 flex flex-wrap items-center border border-border-light dark:border-border-dark">
                <div id="dashboard-filters" class="flex items-center space-x-4 mb-4 md:mb-0 hidden">
                    <label class="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark" for="view-select">Vista:</label>
                    <div class="relative">
                        <select class="appearance-none bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md text-sm py-2 pl-3 pr-8 focus:ring-2 focus:ring-primary-DEFAULT focus:border-primary-DEFAULT" id="view-select">
                            <option>Todas las Tareas</option>
                            <option>Mis Tareas</option>
                            <option>Tareas Asignadas</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-secondary-light dark:text-text-secondary-dark">
                            <i data-lucide="chevron-down" class="w-4 h-4"></i>
                        </div>
                    </div>
                </div>

                <nav id="task-navigation" class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1 ml-auto">
                    <button data-task-view="kanban" class="task-nav-btn px-4 py-1.5 text-sm font-medium rounded-md flex items-center transition-colors">
                        <i data-lucide="list-checks" class="w-4 h-4 mr-2"></i> Mis Tareas
                    </button>
                    <button data-task-view="dashboard" class="task-nav-btn px-4 py-1.5 text-sm font-medium rounded-md flex items-center transition-colors">
                        <i data-lucide="layout-dashboard" class="w-4 h-4 mr-2"></i> Dashboard
                    </button>
                    <button data-task-view="calendar" class="task-nav-btn px-4 py-1.5 text-sm font-medium rounded-md flex items-center transition-colors">
                        <i data-lucide="calendar" class="w-4 h-4 mr-2"></i> Calendario
                    </button>
                    <button id="task-settings-btn" class="px-3 py-1.5 text-sm font-medium rounded-md flex items-center transition-colors text-text-secondary-light dark:text-text-secondary-dark hover:bg-gray-300 dark:hover:bg-gray-600" title="Configuración">
                        <i data-lucide="settings" class="w-4 h-4"></i>
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
            const button = e.target.closest('button');
            if (!button) return;

            if (button.dataset.taskView) {
                renderView(button.dataset.taskView);
            } else if (button.id === 'task-settings-btn') {
                openTelegramConfigModal();
            }
        });
    }

    // Render the initial view passed to the function
    renderView(initialView);
    lucide.createIcons();
}

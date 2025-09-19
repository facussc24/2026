import { initTaskState } from './task.state.js';
import { initTaskService } from './task.service.js';
import { initTaskUI, renderMyPendingTasksWidget, renderTasksByProjectChart } from './task.ui.js';
import { initKanban, runKanbanBoardLogic } from './task.kanban.js';
import { initDashboard, renderTaskDashboardView } from './task.dashboard.js';
import { initCalendar } from './task.calendar.js';
import { calculateOverdueTasksCount, fetchAllTasks } from './task.service.js';

// Exported functions for other modules to use
export {
    calculateOverdueTasksCount,
    fetchAllTasks,
    renderMyPendingTasksWidget,
    renderTasksByProjectChart,
    renderTaskDashboardView
};

export function initTasksModule(dependencies) {
    initTaskState(dependencies);
    initTaskService(dependencies);
    initTaskUI(dependencies);
    initKanban(dependencies);
    initDashboard(dependencies);
    initCalendar(dependencies);
    console.log("Tasks module initialized.");
}

export function runTasksLogic() {
    runKanbanBoardLogic();
}

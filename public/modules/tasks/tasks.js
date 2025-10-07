/**
 * Tasks module bootstrapper.
 *
 * Centralizes the initialization of task-specific services and UI helpers so
 * that `main.js` can remain agnostic of the underlying implementation details.
 * All task-related modules receive the same dependency bag, allowing them to
 * coordinate Firestore access, modal rendering, and shared UI utilities.
 *
 * @module modules/tasks/tasks
 */

import { initTaskService } from './task.service.js';
import { initTaskModal, openTaskFormModal, openAIAssistantModal } from './task.modal.js';

/**
 * Initializes the task module by wiring the task service and modal helpers
 * with the shared application dependencies.
 *
 * @param {Object} deps - Dependency bag provided by the application shell.
 */
export function initTasksModule(deps) {
    initTaskService(deps);
    initTaskModal(deps);
    console.log('Tasks core services initialized.');
}

export { openTaskFormModal, openAIAssistantModal };

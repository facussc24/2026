import { initTaskService } from './task.service.js';
import { initTaskModal, openTaskFormModal, openAIAssistantModal } from './task.modal.js';

export function initTasksModule(deps) {
    initTaskService(deps);
    initTaskModal(deps);
    console.log('Tasks core services initialized.');
}

export { openTaskFormModal, openAIAssistantModal };

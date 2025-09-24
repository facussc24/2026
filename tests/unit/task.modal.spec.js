import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before importing the module under test
const mockHttpsCallable = jest.fn();
jest.mock("https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js", () => ({
    getFunctions: jest.fn(() => ({})),
    httpsCallable: jest.fn(() => mockHttpsCallable),
}));

jest.mock('../../public/modules/shared/ui.js', () => ({
    showToast: jest.fn(),
    showConfirmationModal: jest.fn(),
}));

jest.mock('../../public/permissions.js', () => ({
    checkUserPermission: jest.fn(() => true),
}));

jest.mock('../../public/modules/tasks/task.state.js', () => ({
    getState: jest.fn(() => ({
        kanban: { activeFilter: 'all' }
    })),
}));

jest.mock('../../public/modules/tasks/task.service.js', () => ({
    handleTaskFormSubmit: jest.fn(),
    deleteTask: jest.fn(),
}));

// Mock templates to return a predictable HTML structure
jest.mock('../../public/modules/tasks/task.templates.js', () => ({
    getTaskFormModalHTML: jest.fn((task, defaultStatus, selectedUid, defaultDate, isAdmin) => `
        <div id="task-form-modal">
            <form>
                <!-- AI Section -->
                <textarea id="task-ai-braindump"></textarea>
                <button id="organize-with-ai-btn" data-action="organize">Organizar Tarea</button>

                <!-- Main Task Fields -->
                <input id="task-title" />
                <textarea id="task-description"></textarea>

                <!-- Subtasks Section -->
                <div id="subtasks-list"></div>
                <input id="new-subtask-title" />

                <!-- Metadata -->
                <select id="task-priority">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                </select>
                <input id="task-startdate" type="date" />
                <input id="task-duedate" type="date" />
                <select id="task-assignee">
                    <option value="">No asignada</option>
                    <option value="user-1-id">Usuario Uno</option>
                    <option value="user-2-id">Usuario Dos</option>
                </select>
                <input type="checkbox" id="task-is-public" />

                <!-- Comments Section -->
                <div id="task-comments-list"></div>
                <textarea id="new-task-comment"></textarea>
                <button id="post-comment-btn"></button>

                <!-- Action Buttons -->
                <button data-action="close"></button>
                <button data-action="delete"></button>
            </form>
        </div>
    `),
    getSubtaskHTML: jest.fn(subtask => `<div>${subtask.title}</div>`),
}));

// Import the module to be tested
import { initTaskModal, openTaskFormModal } from '../../public/modules/tasks/task.modal.js';

describe('Task Modal', () => {
    let mockDom;
    let mockAppState;
    let mockLucide;
    let mockDb;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock DOM
        document.body.innerHTML = '<div id="modal-container"></div>';
        mockDom = {
            modalContainer: document.getElementById('modal-container'),
        };

        // Setup mock application state
        mockAppState = {
            currentUser: { uid: 'test-user-id', role: 'admin' },
            collections: {
                usuarios: [
                    { docId: 'user-1-id', name: 'Usuario Uno', email: 'uno@test.com' },
                    { docId: 'user-2-id', name: 'Usuario Dos', email: 'dos@test.com' },
                ],
            },
        };

        mockLucide = {
            createIcons: jest.fn(),
        };

        mockDb = {};

        // Initialize the module with mocks
        initTaskModal({
            appState: mockAppState,
            dom: mockDom,
            lucide: mockLucide,
            db: mockDb,
        });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('AI Task Organization', () => {
        test('should call AI function and populate form fields on success', async () => {
            // Arrange: Setup the mock AI response
            const mockAiResponse = {
                data: {
                    title: 'Test AI Title',
                    description: 'Test AI Description.',
                    subtasks: ['Subtask 1', 'Subtask 2'],
                    priority: 'high',
                    dueDate: '2025-12-31',
                    startDate: '2025-12-20',
                    assignee: 'Usuario Dos',
                    isPublic: true,
                }
            };
            mockHttpsCallable.mockResolvedValue(mockAiResponse);

            // Act: Open the modal and simulate the AI feature usage
            openTaskFormModal();
            const modalElement = document.getElementById('task-form-modal');
            const braindumpTextarea = modalElement.querySelector('#task-ai-braindump');
            const organizeBtn = modalElement.querySelector('#organize-with-ai-btn');

            braindumpTextarea.value = 'Organize my test task for Usuario Dos due Dec 31st';
            await organizeBtn.click();

            // Assert: Check that the form fields are populated correctly
            expect(mockHttpsCallable).toHaveBeenCalledWith({ text: 'Organize my test task for Usuario Dos due Dec 31st' });

            expect(modalElement.querySelector('#task-title').value).toBe('Test AI Title');
            expect(modalElement.querySelector('#task-description').value).toBe('Test AI Description.');
            expect(modalElement.querySelector('#subtasks-list').innerHTML).toContain('Subtask 1');
            expect(modalElement.querySelector('#subtasks-list').innerHTML).toContain('Subtask 2');
            expect(modalElement.querySelector('#task-priority').value).toBe('high');
            expect(modalElement.querySelector('#task-duedate').value).toBe('2025-12-31');
            expect(modalElement.querySelector('#task-startdate').value).toBe('2025-12-20');
            expect(modalElement.querySelector('#task-assignee').value).toBe('user-2-id');
            expect(modalElement.querySelector('#task-is-public').checked).toBe(true);
        });

        test('should show a toast message if AI assignee is not found', async () => {
            // Arrange
            const mockAiResponse = {
                data: {
                    title: 'Another Task',
                    assignee: 'Usuario Tres', // This user does not exist in our mock appState
                }
            };
            mockHttpsCallable.mockResolvedValue(mockAiResponse);
            const { showToast } = require('../../public/modules/shared/ui.js');

            // Act
            openTaskFormModal();
            document.getElementById('task-ai-braindump').value = 'Some task for a non-existent user';
            await document.getElementById('organize-with-ai-btn').click();

            // Assert
            expect(document.getElementById('task-assignee').value).toBe(''); // Should not select an assignee
            expect(showToast).toHaveBeenCalledWith('Sugerencia: No se pudo encontrar un usuario llamado "Usuario Tres".', 'info');
        });

        test('should handle AI function failure gracefully', async () => {
             // Arrange
            const error = new Error('AI processing failed');
            mockHttpsCallable.mockRejectedValue(error);
            const { showToast } = require('../../public/modules/shared/ui.js');

            // Act
            openTaskFormModal();
            document.getElementById('task-ai-braindump').value = 'This will fail';
            await document.getElementById('organize-with-ai-btn').click();

            // Assert
            expect(showToast).toHaveBeenCalledWith('AI processing failed', 'error');
        });
    });
});

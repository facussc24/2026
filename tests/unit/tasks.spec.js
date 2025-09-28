import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the actual modules
import * as taskState from '../../public/modules/tasks/task.state.js';
import * as taskService from '../../public/modules/tasks/task.service.js';
import * as taskUI from '../../public/modules/tasks/task.ui.js';
// Mock the modules
jest.mock('../../public/modules/tasks/task.state.js');
jest.mock('../../public/modules/tasks/task.service.js', () => ({
    ...jest.requireActual('../../public/modules/tasks/task.service.js'),
    initTaskService: jest.fn(),
    subscribeToTasks: jest.fn(() => () => {}), // Mock subscribeToTasks to return an unsubscribe function
    updateTaskStatus: jest.fn().mockResolvedValue(),
}));
jest.mock('../../public/modules/tasks/task.ui.js');

// Import the module to be tested AFTER mocking
import { initTasksModule, runTasksLogic } from '../../public/modules/tasks/tasks.js';

describe('Tasks Module', () => {
  let dependencies;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Set up a comprehensive mock for dependencies, including the missing appState
    dependencies = {
        db: {
            collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                    get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ /* mock task data */ }) })
                }))
            }))
        },
        functions: {},
        appState: {
            currentUser: { uid: 'test-user-id', role: 'admin' }, // Provide the missing currentUser object
            collectionsById: {
                usuarios: new Map([
                    ['user1', { name: 'Alice' }],
                    ['user2', { name: 'Bob' }]
                ])
            }
        },
        dom: {
            viewContent: {
                querySelector: jest.fn(),
                querySelectorAll: jest.fn(() => []),
                innerHTML: '',
                addEventListener: jest.fn(),
            }
        },
        showToast: jest.fn(),
        showConfirmationModal: jest.fn(),
        lucide: {
            createIcons: jest.fn()
        },
        openTaskFormModal: jest.fn(),
        switchView: jest.fn(),
    };

    // Mock the querySelector to return a more detailed, nested structure
    const mockSearchInput = { addEventListener: jest.fn(), value: '' };
    const mockUnifiedTaskView = {
        addEventListener: jest.fn(),
        querySelector: jest.fn(selector => {
            if (selector === '#task-search-input') {
                return mockSearchInput;
            }
            return null;
        })
    };
    dependencies.dom.viewContent.querySelector.mockImplementation(selector => {
        if (selector === '#unified-task-view') {
            return mockUnifiedTaskView;
        }
        return {
            innerHTML: '',
            addEventListener: jest.fn(),
            classList: { toggle: jest.fn(), add: jest.fn(), remove: jest.fn() },
            value: ''
        };
    });

    // Initialize the module once for all tests in this suite
    initTasksModule(dependencies);
  });

  test('initTasksModule should initialize all sub-modules', () => {
    // This test is now simpler as init is in beforeEach
    // The call is implicitly tested, but we can check the mocks.
    expect(taskState.initTaskState).toHaveBeenCalledWith(dependencies);
    expect(taskService.initTaskService).toHaveBeenCalledWith(dependencies);
    expect(taskUI.initTaskUI).toHaveBeenCalledWith(dependencies);
    // The following are now obsolete and have been removed.
    // expect(taskKanban.initKanban).toHaveBeenCalledWith(dependencies);
    // expect(taskDashboard.initDashboard).toHaveBeenCalledWith(dependencies);
    // expect(taskCalendar.initCalendar).toHaveBeenCalledWith(dependencies);
  });

  test('runTasksLogic should render the unified task view', () => {
    // Mock the service to prevent it from actually running
    taskService.subscribeToTasks.mockReturnValue(() => {});

    // Act
    runTasksLogic();

    // Assert
    // Check for elements of the new unified view
    expect(dependencies.dom.viewContent.innerHTML).toContain('<div id="unified-task-view"');
    expect(dependencies.dom.viewContent.innerHTML).toContain('Gestor de Tareas');
    expect(dependencies.dom.viewContent.innerHTML).toContain('id="task-filters"');
    expect(dependencies.dom.viewContent.innerHTML).toContain('id="task-list-container"');
  });

  test('runTasksLogic should call subscribeToTasks on render', () => {
    // Mock the service to check if it's called
    taskService.subscribeToTasks.mockReturnValue(() => {}); // Return an empty unsubscribe function

    // Act
    runTasksLogic();

    // Assert
    expect(taskService.subscribeToTasks).toHaveBeenCalled();
  });

});
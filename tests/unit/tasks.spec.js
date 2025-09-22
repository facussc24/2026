import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Import the actual modules
import * as taskState from '../../public/modules/tasks/task.state.js';
import * as taskService from '../../public/modules/tasks/task.service.js';
import * as taskUI from '../../public/modules/tasks/task.ui.js';
import * as taskKanban from '../../public/modules/tasks/task.kanban.js';
import * as taskDashboard from '../../public/modules/tasks/task.dashboard.js';
import * as taskCalendar from '../../public/modules/tasks/task.calendar.js';

// Mock the modules
jest.mock('../../public/modules/tasks/task.state.js');
jest.mock('../../public/modules/tasks/task.service.js');
jest.mock('../../public/modules/tasks/task.ui.js');
jest.mock('../../public/modules/tasks/task.kanban.js');
jest.mock('../../public/modules/tasks/task.dashboard.js');
jest.mock('../../public/modules/tasks/task.calendar.js');

// Import the module to be tested AFTER mocking
import { initTasksModule, runTasksLogic } from '../../public/modules/tasks/tasks.js';

// Mocks for dependencies passed into initTasksModule
const mockDom = {
  viewContent: {
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []), // Ensure querySelectorAll returns an array
    innerHTML: '',
  },
};

const mockLucide = {
  createIcons: jest.fn(),
};

describe('Tasks Module', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset the mock DOM
    mockDom.viewContent.innerHTML = '';

    // --- More specific mock setup ---
    const mockNavButton = {
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
      },
    };

    const mockTaskNav = {
      addEventListener: jest.fn(),
    };

    // Make the querySelector mock smarter
    mockDom.viewContent.querySelector.mockImplementation(selector => {
      if (selector.startsWith('.task-nav-btn')) {
        return mockNavButton;
      }
      if (selector === '#task-navigation') {
        return mockTaskNav;
      }
      if (selector === '#dashboard-filters') {
        return { classList: { toggle: jest.fn() } };
      }
       if (selector === '#task-view-container') {
        return { innerHTML: '' };
      }
      // Return a generic mock for any other query to prevent errors
      return {
        innerHTML: '',
        querySelectorAll: jest.fn(() => []),
        querySelector: jest.fn(),
         classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
        addEventListener: jest.fn(),
      };
    });
  });

  test('initTasksModule should initialize all sub-modules', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };

    // Act
    initTasksModule(dependencies);

    // Assert
    expect(taskState.initTaskState).toHaveBeenCalledWith(dependencies);
    expect(taskService.initTaskService).toHaveBeenCalledWith(dependencies);
    expect(taskUI.initTaskUI).toHaveBeenCalledWith(dependencies);
    expect(taskKanban.initKanban).toHaveBeenCalledWith(dependencies);
    expect(taskDashboard.initDashboard).toHaveBeenCalledWith(dependencies);
    expect(taskCalendar.initCalendar).toHaveBeenCalledWith(dependencies);
  });

  test('runTasksLogic should render the main task container and navigation', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };
    initTasksModule(dependencies);

    // Act
    runTasksLogic();

    // Assert
    expect(mockDom.viewContent.innerHTML).toContain('<div id="task-main-container"');
    expect(mockDom.viewContent.innerHTML).toContain('<h2 class="text-3xl font-bold text-text-light dark:text-text-dark">Gestor de Tareas</h2>');
    expect(mockDom.viewContent.innerHTML).toContain('<nav id="task-navigation"');
    expect(mockDom.viewContent.innerHTML).toContain('data-task-view="kanban"');
    expect(mockDom.viewContent.innerHTML).toContain('data-task-view="dashboard"');
    expect(mockDom.viewContent.innerHTML).toContain('data-task-view="calendar"');
    expect(mockDom.viewContent.innerHTML).toContain('<div id="task-view-container"');
  });

  test('runTasksLogic should default to the "dashboard" view', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };
    initTasksModule(dependencies);

    // Act
    runTasksLogic();

    // Assert
    expect(taskDashboard.renderTaskDashboardView).toHaveBeenCalled();
    expect(taskKanban.runKanbanBoardLogic).not.toHaveBeenCalled();
  });

  test('runTasksLogic should render the dashboard view when specified', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };
    initTasksModule(dependencies);

    // Act
    runTasksLogic('dashboard');

    // Assert
    expect(taskDashboard.renderTaskDashboardView).toHaveBeenCalled();
    expect(taskKanban.runKanbanBoardLogic).not.toHaveBeenCalled();
  });

  test('runTasksLogic should render the kanban view when specified', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };
    initTasksModule(dependencies);

    // Act
    runTasksLogic('kanban');

    // Assert
    expect(taskKanban.runKanbanBoardLogic).toHaveBeenCalledWith(expect.objectContaining({ innerHTML: '' }));
    expect(taskDashboard.renderTaskDashboardView).not.toHaveBeenCalled();
  });

  test('runTasksLogic should render the calendar view when specified', () => {
    // Arrange
    const dependencies = { dom: mockDom, lucide: mockLucide };
    initTasksModule(dependencies);

    // Act
    runTasksLogic('calendar');

    // Assert
    expect(taskCalendar.renderTaskCalendar).toHaveBeenCalled();
  });
});

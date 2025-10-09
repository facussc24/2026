import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';

const mockAppState = {
  collectionsById: {
    usuarios: new Map(),
  },
};

const mockDom = {};

jest.unstable_mockModule('../../public/main.js', () => ({
  appState: mockAppState,
  dom: mockDom,
}));

let assignLanesToTasks;
let taskOverlapsRange;
let getTaskDurationLabel;
let getTaskDateRangeLabel;
let MIN_BAR_DURATION_DAYS;
let getSafeDueDateISO;

beforeAll(async () => {
  const timelineModule = await import('../../public/modules/timeline/index.js');
  assignLanesToTasks = timelineModule.assignLanesToTasks;
  taskOverlapsRange = timelineModule.taskOverlapsRange;
  getTaskDurationLabel = timelineModule.getTaskDurationLabel;
  getTaskDateRangeLabel = timelineModule.getTaskDateRangeLabel;
  MIN_BAR_DURATION_DAYS = timelineModule.MIN_BAR_DURATION_DAYS;
  getSafeDueDateISO = timelineModule.getSafeDueDateISO;
});

beforeEach(() => {
  mockAppState.collectionsById = {
    usuarios: new Map(),
  };
});

describe('Timeline scheduling fallbacks', () => {
  test('taskOverlapsRange uses a minimum duration when dueDate is missing', () => {
    const task = {
      startDate: '2024-05-01',
      dueDate: null,
    };

    expect(taskOverlapsRange(task, '2024-05-02', '2024-05-04')).toBe(true);
    expect(taskOverlapsRange(task, '2024-05-05', '2024-05-10')).toBe(false);
  });

  test('assignLanesToTasks assigns minimum width and separate lanes for overlapping fallbacks', () => {
    const tasks = [
      { id: 'a', title: 'Tarea A', startDate: '2024-05-01', dueDate: null, status: 'todo' },
      { id: 'b', title: 'Tarea B', startDate: '2024-05-02', dueDate: null, status: 'todo' },
    ];

    const context = { zoomLevel: 'year', visibleDate: new Date('2024-01-01T00:00:00') };
    const { lanedTasks, totalLanes } = assignLanesToTasks(tasks, context);

    expect(lanedTasks).toHaveLength(2);
    expect(totalLanes).toBe(2);

    const firstTask = lanedTasks.find(task => task.id === 'a');
    const secondTask = lanedTasks.find(task => task.id === 'b');

    expect(firstTask).toBeDefined();
    expect(secondTask).toBeDefined();

    expect(firstTask.endDay - firstTask.startDay + 1).toBe(MIN_BAR_DURATION_DAYS);
    expect(firstTask.effectiveDueDate).toBe(getSafeDueDateISO('2024-05-01', null));
    expect(secondTask.laneIndex).not.toBe(firstTask.laneIndex);
  });

  test('duration and range labels derive fallbacks for missing due dates', () => {
    const expectedFallbackISO = getSafeDueDateISO('2024-05-01', null);
    const explicitLabel = getTaskDateRangeLabel('2024-05-01', expectedFallbackISO);
    const fallbackLabel = getTaskDateRangeLabel('2024-05-01', null);

    expect(getTaskDurationLabel('2024-05-01', null)).toBe(`${MIN_BAR_DURATION_DAYS} días`);
    expect(fallbackLabel).toBe(explicitLabel);
  });
});

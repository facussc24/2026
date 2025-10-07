import {
  filterTasks,
  getTimelineScaleConfig,
  normalizeFilters,
  resolveViewState,
  TIMELINE_SCALES,
  VIEW_TYPES,
} from '../public/modules/tasks_new/tasks_ui.js';

describe('tasks_ui helpers', () => {
  test('normalizeFilters convierte valores "all" en null', () => {
    const result = normalizeFilters({
      assignedTo: 'all',
      status: 'TodoS',
      priority: 'HIGH',
    });
    expect(result).toEqual({
      assignedTo: null,
      status: null,
      priority: 'HIGH',
    });
  });

  test('filterTasks aplica filtros de asignación, estado y prioridad', () => {
    const tasks = [
      { id: '1', assignedTo: 'a', resource: 'a', status: 'todo', priority: 'low' },
      { id: '2', assignedTo: 'b', resource: 'team-1', status: 'inprogress', priority: 'med' },
      { id: '3', assignedTo: 'a', resource: 'a', status: 'done', priority: 'med' },
    ];

    const filtered = filterTasks(tasks, { assignedTo: 'a', status: 'done', priority: 'med' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('3');
  });

  test('getTimelineScaleConfig devuelve configuraciones consistentes', () => {
    const hours = getTimelineScaleConfig(TIMELINE_SCALES.HOURS);
    expect(hours.scale).toBe('CellDuration');
    expect(hours.cellDuration).toBe(60);

    const weeks = getTimelineScaleConfig(TIMELINE_SCALES.WEEKS);
    expect(weeks.scale).toBe('Week');
    expect(weeks.timeHeaders).toHaveLength(2);

    const fallback = getTimelineScaleConfig('desconocido');
    expect(fallback.scale).toBe('Day');
  });

  test('resolveViewState controla visibilidad de vistas', () => {
    const timelineState = resolveViewState(VIEW_TYPES.TIMELINE, VIEW_TYPES.CALENDAR);
    expect(timelineState.activeView).toBe(VIEW_TYPES.TIMELINE);
    expect(timelineState.calendarDisplay).toBe('none');
    expect(timelineState.schedulerDisplay).toBe('block');

    const calendarState = resolveViewState('cualquier', VIEW_TYPES.TIMELINE);
    expect(calendarState.activeView).toBe(VIEW_TYPES.CALENDAR);
    expect(calendarState.calendarDisplay).toBe('block');
    expect(calendarState.schedulerDisplay).toBe('none');
    expect(calendarState.previousView).toBe(VIEW_TYPES.TIMELINE);
  });
});

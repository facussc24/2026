import { jest } from '@jest/globals';
import {
  initTasksService,
  createTask,
  updateTask,
  toCalendarEvent,
  toSchedulerEvent,
  TasksNewValidationError,
} from '../public/modules/tasks_new/tasks_service.js';
import {
  addDoc,
  updateDoc,
  getDoc,
  collection,
  doc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

describe('tasks_service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.DEBUG_TASKS = 'false';
    window.showToast = jest.fn();
    initTasksService({ db: {}, appState: { currentUser: { role: 'admin' } } });
  });

  test('createTask valida y persiste los datos requeridos', async () => {
    const start = new Date('2024-01-01T10:00:00Z');
    const end = new Date('2024-01-01T11:30:00Z');
    addDoc.mockResolvedValue({ id: 'abc123' });
    collection.mockReturnValue('tareas');

    const result = await createTask({
      title: 'Reunión de planificación',
      description: 'Sincronización semanal',
      start,
      end,
      priority: 'high',
      assignedTo: 'usuario-1',
    });

    expect(result).toEqual({ id: 'abc123' });
    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload.title).toBe('Reunión de planificación');
    expect(payload.start).toBeInstanceOf(Date);
    expect(payload.end).toBeInstanceOf(Date);
    expect(payload.priorityCode).toBe('high');
    expect(payload.assignedTo).toBe('usuario-1');
  });

  test('updateTask normaliza los cambios y actualiza Firestore', async () => {
    const start = new Date('2024-02-01T09:00:00Z');
    const end = new Date('2024-02-01T10:00:00Z');
    const updatedEnd = new Date('2024-02-01T11:00:00Z');

    getDoc.mockResolvedValue({
      exists: () => true,
      id: 'tarea-1',
      data: () => ({
        title: 'Tarea original',
        start,
        end,
        status: 'todo',
        priority: 'med',
        assignedTo: 'usuario-2',
      }),
    });
    updateDoc.mockResolvedValue();
    doc.mockReturnValue('doc-ref');

    await updateTask('tarea-1', { title: 'Título actualizado', end: updatedEnd });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.title).toBe('Título actualizado');
    expect(payload.end).toBeInstanceOf(Date);
    expect(payload.updatedAt).toBeInstanceOf(Date);
  });

  test('createTask lanza error de validación con datos incompletos', async () => {
    await expect(createTask({
      title: 'Sin fin',
      start: '2024-03-01T10:00:00Z',
    })).rejects.toBeInstanceOf(TasksNewValidationError);
    expect(addDoc).not.toHaveBeenCalled();
  });

  test('mapeos DayPilot utilizan formato esperado', () => {
    const start = new Date('2024-04-05T08:00:00Z');
    const end = new Date('2024-04-05T09:30:00Z');
    const task = {
      id: 'map-1',
      title: 'Chequeo',
      start,
      end,
      resource: 'usuario-3',
      color: '#abcdef',
    };

    expect(toCalendarEvent(task)).toEqual({
      id: 'map-1',
      text: 'Chequeo',
      start: start.toISOString(),
      end: end.toISOString(),
      backColor: '#abcdef',
    });

    expect(toSchedulerEvent(task)).toEqual({
      id: 'map-1',
      text: 'Chequeo',
      start: start.toISOString(),
      end: end.toISOString(),
      resource: 'usuario-3',
      barColor: '#abcdef',
    });
  });
});

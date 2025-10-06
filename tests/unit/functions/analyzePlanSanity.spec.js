jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  apps: [],
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'timestamp'),
      arrayUnion: (...values) => ({ __arrayUnion: values }),
    },
  },
  auth: () => ({
    getUser: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
  }),
}));

jest.mock('firebase-functions/v1', () => {
  const onCall = jest.fn((handler) => handler);
  const onRequest = jest.fn((handler) => handler);
  const onRun = jest.fn(() => jest.fn());
  const document = jest.fn(() => ({
    onWrite: jest.fn(() => jest.fn()),
    onCreate: jest.fn(() => jest.fn()),
    onUpdate: jest.fn(() => jest.fn()),
    onDelete: jest.fn(() => jest.fn()),
  }));
  const schedule = jest.fn(() => ({
    timeZone: jest.fn().mockReturnThis(),
    onRun,
  }));

  const mockFunctions = {
    https: {
      onCall,
      onRequest,
      HttpsError: class extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      },
    },
    runWith: jest.fn(() => mockFunctions),
    pubsub: { schedule },
    firestore: { document },
  };
  return mockFunctions;
}, { virtual: true });

const { analyzePlanSanity } = require('../../../functions/index.js');

describe('analyzePlanSanity callable', () => {
  const authContext = { auth: { uid: 'tester' } };

  it('counts CREATE actions towards the daily workload and warns when overloaded or overdue', async () => {
    const plan = [
      {
        action: 'CREATE',
        task: { title: 'Tarea 1', plannedDate: '2025-05-20', effort: 'medium' },
      },
      {
        action: 'CREATE',
        task: { title: 'Tarea 2', plannedDate: '2025-05-20', effort: 'medium' },
      },
      {
        action: 'CREATE',
        task: { title: 'Tarea 3', plannedDate: '2025-05-20', effort: 'medium' },
      },
      {
        action: 'CREATE',
        task: { title: 'Tarea 4', plannedDate: '2025-05-20', effort: 'medium' },
      },
      {
        action: 'CREATE',
        task: { title: 'Tarea 5', plannedDate: '2025-05-20', effort: 'medium' },
      },
      {
        action: 'CREATE',
        task: {
          title: 'Tarea con vencimiento',
          plannedDate: '2025-05-22',
          dueDate: '2025-05-20',
          effort: 'low',
        },
      },
    ];

    const result = await analyzePlanSanity({ plan, tasks: [] }, authContext);

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('parece sobrecargado en esfuerzo'),
        expect.stringContaining('tiene muchas tareas'),
        expect.stringContaining('La nueva tarea "Tarea con vencimiento" está planificada después de su fecha de vencimiento'),
      ])
    );
  });

  it('uses updated effort values when tasks are rescheduled in the plan', async () => {
    const plan = [
      {
        action: 'UPDATE',
        docId: 'task-1',
        updates: { plannedDate: '2025-06-10', effort: 'HIGH' },
      },
      {
        action: 'UPDATE',
        docId: 'task-2',
        updates: { plannedDate: '2025-06-10' },
      },
      {
        action: 'CREATE',
        task: { title: 'Nueva sin esfuerzo', plannedDate: '2025-06-10' },
      },
    ];

    const tasks = [
      { docId: 'task-1', title: 'Alta', effort: 'low' },
      { docId: 'task-2', title: 'Media', effort: 'medium' },
    ];

    const result = await analyzePlanSanity({ plan, tasks }, authContext);

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('parece sobrecargado en esfuerzo'),
      ]),
    );
    expect(result.suggestions).toEqual(
      expect.not.arrayContaining([
        expect.stringContaining('tiene muchas tareas'),
      ]),
    );
  });

  it('detects when rescheduled tasks exceed their due date', async () => {
    const plan = [
      {
        action: 'UPDATE',
        docId: 'task-1',
        updates: { plannedDate: '2025-07-05' },
      },
    ];

    const tasks = [
      { docId: 'task-1', title: 'Reporte trimestral', dueDate: '2025-07-01', effort: 'high' },
    ];

    const result = await analyzePlanSanity({ plan, tasks }, authContext);

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Reporte trimestral'),
      ]),
    );
  });

  it('returns no suggestions when the plan is balanced and on time', async () => {
    const plan = [
      {
        action: 'CREATE',
        task: { title: 'Investigación', plannedDate: '2025-08-10', effort: 'low' },
      },
      {
        action: 'CREATE',
        task: { title: 'Diseño', plannedDate: '2025-08-11', effort: 'medium' },
      },
      {
        action: 'UPDATE',
        docId: 'task-2',
        updates: { plannedDate: '2025-08-12', effort: 'low' },
      },
    ];

    const tasks = [
      { docId: 'task-2', title: 'Revisión', plannedDate: '2025-08-15', effort: 'medium', dueDate: '2025-08-20' },
    ];

    const result = await analyzePlanSanity({ plan, tasks }, authContext);

    expect(result.suggestions).toEqual([]);
  });
});

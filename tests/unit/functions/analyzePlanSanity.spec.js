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
});

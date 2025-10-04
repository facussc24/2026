jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  apps: [],
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'timestamp'),
      arrayUnion: (...values) => ({ __arrayUnion: values }),
    },
  },
}));

const { generateRequestHash } = require('../../../functions/index.js');

const deepClone = (value) => JSON.parse(JSON.stringify(value));

describe('generateRequestHash', () => {
  const basePrompt = 'Plan semanal';
  const baseTasks = [
    {
      docId: 'task-1',
      title: 'Preparar reporte mensual',
      status: 'pending',
      plannedDate: '2025-01-02',
      dueDate: '2025-01-05',
      priority: 'high',
      assigneeEmail: 'analista@example.com',
      blocked: false,
      dependsOn: ['task-3'],
      blocks: ['task-4'],
      subtasks: [
        { title: 'Revisar datos de ventas', completed: false },
        { title: 'Validar con finanzas', completed: false },
      ],
    },
    {
      docId: 'task-2',
      title: 'Coordinar llamada con proveedor',
      status: 'in_progress',
      plannedDate: '2025-01-04',
      dueDate: null,
      priority: 'medium',
      assigneeEmail: 'compras@example.com',
      blocked: false,
      dependsOn: [],
      blocks: [],
      subtasks: [],
    },
  ];

  it('is insensitive to task ordering when the content is unchanged', () => {
    const originalHash = generateRequestHash(basePrompt, deepClone(baseTasks));
    const reversedHash = generateRequestHash(
      basePrompt,
      deepClone(baseTasks).reverse()
    );

    expect(reversedHash).toBe(originalHash);
  });

  it('changes the hash when a critical field like the title is modified', () => {
    const originalHash = generateRequestHash(basePrompt, deepClone(baseTasks));
    const tasksWithNewTitle = deepClone(baseTasks);
    tasksWithNewTitle[0].title = 'Preparar reporte mensual actualizado';

    const updatedHash = generateRequestHash(basePrompt, tasksWithNewTitle);

    expect(updatedHash).not.toBe(originalHash);
  });

  it('changes the hash when dueDate is adjusted', () => {
    const originalHash = generateRequestHash(basePrompt, deepClone(baseTasks));
    const tasksWithNewDueDate = deepClone(baseTasks);
    tasksWithNewDueDate[0].dueDate = '2025-01-06';

    const updatedHash = generateRequestHash(basePrompt, tasksWithNewDueDate);

    expect(updatedHash).not.toBe(originalHash);
  });
});

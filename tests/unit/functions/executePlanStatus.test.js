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

const { _executePlan } = require('../../../functions/index.js');

const createDbMock = ({ failOnUpdate = false } = {}) => {
  const progressDoc = {
    _setSnapshots: [],
    _updateSnapshots: [],
    set: jest.fn((data) => {
      progressDoc._setSnapshots.push(JSON.parse(JSON.stringify(data)));
      return Promise.resolve();
    }),
    update: jest.fn((data) => {
      progressDoc._updateSnapshots.push(JSON.parse(JSON.stringify(data)));
      return Promise.resolve();
    }),
  };

  const generatedDocs = new Map();
  let generatedId = 0;

  const batch = {
    set: jest.fn((ref, data) => {
      ref._setData = data;
    }),
    update: jest.fn((ref, data) => {
      if (failOnUpdate) {
        throw new Error('forced update failure');
      }
      ref._updateData = data;
    }),
    delete: jest.fn((ref) => {
      ref._deleted = true;
    }),
    commit: jest.fn(() => Promise.resolve()),
  };

  const collections = {
    tareas: {
      doc: jest.fn((id) => {
        if (id) {
          if (!generatedDocs.has(id)) {
            generatedDocs.set(id, { id });
          }
          return generatedDocs.get(id);
        }
        const newId = `generated-${++generatedId}`;
        const ref = { id: newId };
        generatedDocs.set(newId, ref);
        return ref;
      }),
    },
    plan_executions: {
      doc: jest.fn(() => progressDoc),
    },
  };

  return {
    db: {
      batch: () => batch,
      collection: (name) => {
        const collection = collections[name];
        if (!collection) {
          throw new Error(`Unknown collection: ${name}`);
        }
        return collection;
      },
    },
    progressDoc,
    batch,
  };
};

describe('_executePlan progress status normalization', () => {
  it('uses lowercase statuses during successful execution', async () => {
    const { db, progressDoc } = createDbMock();
    const plan = [
      {
        action: 'CREATE',
        docId: 'temp-1',
        task: { title: 'Nueva tarea' },
      },
    ];

    await _executePlan(db, plan, 'creator-uid', 'job-123');

    const initialSnapshot = progressDoc._setSnapshots[0];
    expect(initialSnapshot.status).toBe('running');
    expect(initialSnapshot.steps).toHaveLength(1);
    expect(initialSnapshot.steps[0].status).toBe('pending');

    const completionSnapshot = progressDoc._updateSnapshots.find(
      (payload) => payload.status === 'completed'
    );
    expect(completionSnapshot).toBeDefined();
    completionSnapshot.steps.forEach((step) => {
      expect(step.status).toBe('completed');
    });
  });

  it('marks the failing step and document with lowercase error status', async () => {
    const { db, progressDoc } = createDbMock({ failOnUpdate: true });
    const plan = [
      {
        action: 'CREATE',
        docId: 'temp-1',
        task: { title: 'Nueva tarea' },
      },
      {
        action: 'UPDATE',
        docId: 'temp-1',
        updates: { status: 'in_progress' },
      },
    ];

    await expect(
      _executePlan(db, plan, 'creator-uid', 'job-456')
    ).rejects.toThrow('forced update failure');

    const initialSnapshot = progressDoc._setSnapshots[0];
    expect(initialSnapshot.status).toBe('running');

    const errorSnapshot = progressDoc._updateSnapshots.find(
      (payload) => payload.status === 'error'
    );
    expect(errorSnapshot).toBeDefined();
    expect(errorSnapshot.error).toBe('forced update failure');
    const steps = errorSnapshot.steps;
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('error');
    expect(steps[1].error).toBe('forced update failure');
  });
});

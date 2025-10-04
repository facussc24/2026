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

const { _executePlan, extractExplicitDatesFromPrompt } = require('../../../functions/index.js');

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

  it('applies explicit date overrides without additional normalization', async () => {
    const { db, batch } = createDbMock();
    const plan = [
      {
        action: 'CREATE',
        docId: 'temp-1',
        task: { title: 'Nueva tarea', plannedDate: '2025-10-05' },
        metadata: {
          explicitDateOverride: {
            isoDate: '2025-10-03',
            originalText: '3/10',
          },
        },
      },
    ];

    await _executePlan(db, plan, 'creator-uid', 'job-789');

    const setCall = batch.set.mock.calls[0];
    expect(setCall[1].plannedDate).toBe('2025-10-03');
  });
});

describe('extractExplicitDatesFromPrompt helper', () => {
  it('parses numeric day/month expressions respecting the configured timezone', () => {
    const baseDate = new Date('2025-09-10T12:00:00Z');
    const results = extractExplicitDatesFromPrompt(
      'Necesito que agendes esto para el viernes 3/10, por favor.',
      { timeZone: 'America/Argentina/Buenos_Aires', baseDate }
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isoDate: '2025-10-03', originalText: '3/10' }),
      ])
    );
  });

  it('prefers ISO formatted dates over overlapping numeric interpretations', () => {
    const baseDate = new Date('2025-09-10T12:00:00Z');
    const results = extractExplicitDatesFromPrompt(
      'Programar seguimiento para 2025-10-03.',
      { timeZone: 'America/Argentina/Buenos_Aires', baseDate }
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({ isoDate: '2025-10-03', originalText: '2025-10-03' })
    );
  });

  it('rolls 3/10 forward when executed on 4/10 and keeps the date on a business day', () => {
    const baseDate = new Date('2023-10-04T12:00:00Z');
    const results = extractExplicitDatesFromPrompt(
      'Agendar el control para el 3/10.',
      { timeZone: 'America/Argentina/Buenos_Aires', baseDate }
    );

    const candidate = results.find((entry) => entry.originalText === '3/10');
    expect(candidate).toBeDefined();
    if (!candidate) {
      throw new Error('Expected explicit date candidate for 3/10');
    }
    expect(candidate).toEqual(
      expect.objectContaining({
        isoDate: '2024-10-03',
        rolledToFuture: true,
      })
    );

    const candidateDate = new Date(`${candidate.isoDate}T12:00:00Z`);
    const dayOfWeek = candidateDate.getUTCDay();
    expect([0, 6]).not.toContain(dayOfWeek);
  });
});

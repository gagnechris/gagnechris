import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncLedger } from '../../src/sync/ledger.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { NotFoundError } from '../../src/data/errors.js';
import { createTasksRepository } from '../../src/tasks/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const USER_A = 'user-a-tasks';
const USER_B = 'user-b-tasks';
const TASK_1 = '01ARZ3NDEKTSV4RRFFQ69G5TA1';
const TASK_2 = '01ARZ3NDEKTSV4RRFFQ69G5TA2';
const TASK_3 = '01ARZ3NDEKTSV4RRFFQ69G5TA3';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5NO1';

describe('tasks repository (DynamoDB Local)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('tasks-api');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerProductionSyncAdapters();
  });

  it('isolates owners, filters due ranges, lists by note, and feeds typed task changes', async () => {
    const repo = createTasksRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const ledger = new SyncLedger(
      doc,
      tableName,
      () => '2026-10-02T12:00:00.000Z',
    );

    const overdue = await repo.createFromRequest(USER_A, {
      id: TASK_1,
      area: 'work',
      title: 'Overdue',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-09-28',
      tags: [],
    });
    expect(overdue.version).toBe(1);

    await repo.createFromRequest(USER_A, {
      id: TASK_2,
      area: 'work',
      title: 'Due soon',
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: '2026-10-05',
      noteId: NOTE_ID,
      tags: [],
    });

    await repo.createFromRequest(USER_A, {
      id: TASK_3,
      area: 'work',
      title: 'Undated',
      description: '',
      priority: 'low',
      status: 'todo',
      tags: [],
    });

    await expect(repo.getOrThrow(USER_B, TASK_1)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const before = await repo.list(USER_A, {
      area: 'work',
      status: 'todo',
      dueBefore: '2026-10-01',
    });
    expect(before.items.map((t) => t.id)).toEqual([TASK_1]);

    const dueOn = await repo.list(USER_A, {
      area: 'work',
      status: 'todo',
      dueOn: '2026-10-05',
    });
    expect(dueOn.items.map((t) => t.id)).toEqual([TASK_2]);

    const byNote = await repo.list(USER_A, { noteId: NOTE_ID });
    expect(byNote.items.map((t) => t.id)).toEqual([TASK_2]);

    const allTodo = await repo.list(USER_A, {
      area: 'work',
      status: 'todo',
    });
    expect(allTodo.items.map((t) => t.id)).toEqual([TASK_1, TASK_2, TASK_3]);

    const done = await repo.complete(USER_A, TASK_1, 1);
    expect(done.status).toBe('done');
    expect(done.completedAt).toBe('2026-10-02T10:00:00.000Z');

    const reopened = await repo.reopen(USER_A, TASK_1, 2);
    expect(reopened.status).toBe('todo');
    expect(reopened.completedAt).toBeNull();

    const feed = await ledger.queryChangesSince(USER_A, {});
    expect(feed.changes.some((c) => c.type === 'task')).toBe(true);
    expect(feed.changes.map((c) => c.id).sort()).toEqual(
      [TASK_1, TASK_2, TASK_3].sort(),
    );
  });
});

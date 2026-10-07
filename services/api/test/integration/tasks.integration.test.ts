import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncLedger } from '../../src/sync/ledger.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { NotFoundError } from '../../src/data/errors.js';
import { TasksRepository } from '../../src/tasks/repository.js';
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
    const repo = new TasksRepository(
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

  it('round-trips startDate and someday with version-checked updates', async () => {
    const repo = new TasksRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const created = await repo.createFromRequest(USER_A, {
      id: TASK_1,
      area: 'personal',
      title: 'Renew passport',
      description: '',
      priority: 'med',
      status: 'todo',
      startDate: '2026-10-06',
      tags: [],
    });
    expect(created).toMatchObject({ startDate: '2026-10-06', someday: false });
    expect(await repo.getOrThrow(USER_A, TASK_1)).toEqual(created);

    const someday = await repo.updateFromRequest(USER_A, TASK_1, 1, {
      someday: true,
    });
    expect(someday).toMatchObject({
      version: 2,
      startDate: null,
      someday: true,
    });
    await expect(
      repo.updateFromRequest(USER_A, TASK_1, 1, { startDate: '2026-10-07' }),
    ).rejects.toMatchObject({ code: 'version_conflict' });

    const back = await repo.updateFromRequest(USER_A, TASK_1, 2, {
      startDate: '2026-10-07',
    });
    expect(back).toMatchObject({
      version: 3,
      startDate: '2026-10-07',
      someday: false,
    });
    expect(await repo.getOrThrow(USER_A, TASK_1)).toEqual(back);
  });

  it("getMany reads live tasks in request order, leaving out deleted, unknown and other users' ids", async () => {
    const repo = new TasksRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const base = {
      area: 'work' as const,
      description: '',
      priority: 'med' as const,
      status: 'todo' as const,
      tags: [],
    };
    await repo.createFromRequest(USER_A, { ...base, id: TASK_1, title: 'One' });
    await repo.createFromRequest(USER_A, { ...base, id: TASK_2, title: 'Two' });
    await repo.createFromRequest(USER_B, { ...base, id: TASK_3, title: 'B' });
    await repo.deleteIfVersion(USER_A, TASK_1, 1);
    const unknown = '01ARZ3NDEKTSV4RRFFQ69G5TA9';

    const got = await repo.getMany(USER_A, [
      TASK_2,
      unknown,
      TASK_1,
      TASK_3,
      TASK_2,
    ]);
    expect(got.map((t) => t.title)).toEqual(['Two']);
    expect(await repo.getMany(USER_B, [TASK_3])).toMatchObject([
      { id: TASK_3, title: 'B' },
    ]);
  });

  it('startAfter with startBefore reads only that window of show-on days', async () => {
    const repo = new TasksRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const days = ['2026-10-02', '2026-10-03', '2026-10-16', '2026-10-17'];
    for (const [i, startDate] of days.entries()) {
      await repo.createFromRequest(USER_A, {
        id: `01ARZ3NDEKTSV4RRFFQ69G5TB${i}`,
        area: 'work',
        title: startDate,
        description: '',
        priority: 'med',
        status: 'todo',
        startDate,
        tags: [],
      });
    }
    await repo.createFromRequest(USER_A, {
      id: '01ARZ3NDEKTSV4RRFFQ69G5TC1',
      area: 'work',
      title: 'undated',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    });
    const page = await repo.list(USER_A, {
      area: 'work',
      open: true,
      startAfter: '2026-10-02',
      startBefore: '2026-10-17',
    });
    expect(page.items.map((t) => t.title).sort()).toEqual([
      '2026-10-03',
      '2026-10-16',
    ]);
  });
});

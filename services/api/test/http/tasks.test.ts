import { describe, expect, it } from 'vitest';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-a-tasks';
const USER_B = 'user-b-tasks';
const TASK_1 = '01ARZ3NDEKTSV4RRFFQ69G5TA1';
const TASK_2 = '01ARZ3NDEKTSV4RRFFQ69G5TA2';
const TASK_3 = '01ARZ3NDEKTSV4RRFFQ69G5TA3';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5N01';

type Task = { id: string; version: number; [key: string]: unknown };

const h = useApi('tasks-api');

function call(
  user: string,
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
) {
  return h.api.request(method, path, { ...opts, claims: notebookUser(user) });
}

async function ok<T = Task>(
  user: string,
  method: string,
  path: string,
  opts?: Parameters<typeof call>[3],
): Promise<T> {
  const res = await call(user, method, path, opts);
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body as T;
}

const createTask = (user: string, body: Record<string, unknown>) =>
  ok(user, 'POST', '/api/notebook/tasks', { body });

const listIds = async (user: string, query: Record<string, string>) =>
  (
    await ok<{ items: Task[] }>(user, 'GET', '/api/notebook/tasks', { query })
  ).items.map((t) => t.id);

describe('tasks (DynamoDB Local)', () => {
  it('isolates owners, filters due ranges, lists by note, and feeds typed task changes', async () => {
    await ok(USER_A, 'POST', '/api/notebook/notes', {
      body: { id: NOTE_ID, area: 'work', type: 'page', title: 'Linked' },
    });

    const overdue = await createTask(USER_A, {
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

    await createTask(USER_A, {
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

    await createTask(USER_A, {
      id: TASK_3,
      area: 'work',
      title: 'Undated',
      description: '',
      priority: 'low',
      status: 'todo',
      tags: [],
    });

    expect(
      (await call(USER_B, 'GET', `/api/notebook/tasks/${TASK_1}`)).status,
    ).toBe(404);

    expect(
      await listIds(USER_A, {
        area: 'work',
        status: 'todo',
        dueBefore: '2026-10-01',
      }),
    ).toEqual([TASK_1]);

    expect(
      await listIds(USER_A, {
        area: 'work',
        status: 'todo',
        dueOn: '2026-10-05',
      }),
    ).toEqual([TASK_2]);

    expect(await listIds(USER_A, { noteId: NOTE_ID })).toEqual([TASK_2]);

    expect(await listIds(USER_A, { area: 'work', status: 'todo' })).toEqual([
      TASK_1,
      TASK_2,
      TASK_3,
    ]);

    const beforeComplete = new Date().toISOString();
    const done = await ok(
      USER_A,
      'POST',
      `/api/notebook/tasks/${TASK_1}/complete`,
      { body: { version: 1 } },
    );
    const afterComplete = new Date().toISOString();
    expect(done.status).toBe('done');
    expect(typeof done.completedAt).toBe('string');
    expect((done.completedAt as string) >= beforeComplete).toBe(true);
    expect((done.completedAt as string) <= afterComplete).toBe(true);

    const reopened = await ok(
      USER_A,
      'POST',
      `/api/notebook/tasks/${TASK_1}/reopen`,
      { body: { version: 2 } },
    );
    expect(reopened.status).toBe('todo');
    expect(reopened.completedAt).toBeNull();

    const feed = await ok<{ changes: Array<{ id: string; type: string }> }>(
      USER_A,
      'GET',
      '/api/notebook/sync/changes',
    );
    expect(feed.changes.map((c) => c.id).sort()).toEqual(
      [NOTE_ID, TASK_1, TASK_2, TASK_3].sort(),
    );
    expect(
      feed.changes
        .filter((c) => c.type === 'task')
        .map((c) => c.id)
        .sort(),
    ).toEqual([TASK_1, TASK_2, TASK_3].sort());
  });

  it('round-trips startDate and someday with version-checked updates', async () => {
    const created = await createTask(USER_A, {
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
    expect(await ok(USER_A, 'GET', `/api/notebook/tasks/${TASK_1}`)).toEqual(
      created,
    );

    const someday = await ok(USER_A, 'PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, someday: true },
    });
    expect(someday).toMatchObject({
      version: 2,
      startDate: null,
      someday: true,
    });
    const stale = await call(USER_A, 'PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, startDate: '2026-10-07' },
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'version_conflict' });

    const back = await ok(USER_A, 'PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 2, startDate: '2026-10-07' },
    });
    expect(back).toMatchObject({
      version: 3,
      startDate: '2026-10-07',
      someday: false,
    });
    expect(await ok(USER_A, 'GET', `/api/notebook/tasks/${TASK_1}`)).toEqual(
      back,
    );
  });

  it("batch reads live tasks in request order, leaving out deleted, unknown and other users' ids", async () => {
    const base = {
      area: 'work',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    };
    await createTask(USER_A, { ...base, id: TASK_1, title: 'One' });
    await createTask(USER_A, { ...base, id: TASK_2, title: 'Two' });
    await createTask(USER_B, { ...base, id: TASK_3, title: 'B' });
    await ok(USER_A, 'DELETE', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1 },
    });
    const unknown = '01ARZ3NDEKTSV4RRFFQ69G5TA9';

    const got = await ok<{ items: Task[] }>(
      USER_A,
      'POST',
      '/api/notebook/tasks/batch',
      { body: { ids: [TASK_2, unknown, TASK_1, TASK_3, TASK_2] } },
    );
    expect(got.items.map((t) => t.title)).toEqual(['Two']);
    const forB = await ok<{ items: Task[] }>(
      USER_B,
      'POST',
      '/api/notebook/tasks/batch',
      { body: { ids: [TASK_3] } },
    );
    expect(forB.items).toMatchObject([{ id: TASK_3, title: 'B' }]);
  });

  it('startAfter with startBefore reads only that window of show-on days', async () => {
    const days = ['2026-10-02', '2026-10-03', '2026-10-16', '2026-10-17'];
    for (const [i, startDate] of days.entries()) {
      await createTask(USER_A, {
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
    await createTask(USER_A, {
      id: '01ARZ3NDEKTSV4RRFFQ69G5TC1',
      area: 'work',
      title: 'undated',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    });
    const page = await ok<{ items: Task[] }>(
      USER_A,
      'GET',
      '/api/notebook/tasks',
      {
        query: {
          area: 'work',
          open: 'true',
          startAfter: '2026-10-02',
          startBefore: '2026-10-17',
        },
      },
    );
    expect(page.items.map((t) => t.title).sort()).toEqual([
      '2026-10-03',
      '2026-10-16',
    ]);
  });
});

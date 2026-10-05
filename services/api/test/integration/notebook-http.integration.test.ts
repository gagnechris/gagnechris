// The Notebook as two people use it: every request goes through the
// production route table and the real repositories on DynamoDB Local.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { SYNC_TOMBSTONE_TTL_DAYS } from '@gagnechris/data';
import { setDocClient } from '../../src/data/client.js';
import { dispatchRoutes } from '../../src/router.js';
import { routes } from '../../src/routes.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

const A = 'user-notebook-http-a';
const B = 'user-notebook-http-b';

type Res = {
  status: number;
  etag: string | undefined;
  body: Record<string, unknown>;
};

type Entity = { id: string; version: number; [key: string]: unknown };

async function call(
  user: string,
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string>;
    ifMatch?: string;
  } = {},
): Promise<Res> {
  const res = await dispatchRoutes(
    routes,
    makeEvent(method, path, {
      body: opts.body,
      query: opts.query,
      headers: opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined,
      jwtClaims: { sub: user },
    }),
    method,
    path,
  );
  const headers = (res.headers ?? {}) as Record<string, string>;
  return {
    status: res.statusCode ?? 0,
    etag: headers.ETag ?? headers.etag,
    body: res.body ? (JSON.parse(res.body as string) as never) : {},
  };
}

async function ok(
  user: string,
  method: string,
  path: string,
  opts?: Parameters<typeof call>[3],
): Promise<Entity> {
  const res = await call(user, method, path, opts);
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body as Entity;
}

const createPage = (user: string, over: Record<string, unknown> = {}) =>
  ok(user, 'POST', '/api/notebook/notes', {
    body: { id: ulid(), area: 'work', type: 'page', ...over },
  });

const putDaily = (
  user: string,
  area: string,
  date: string,
  body: Record<string, unknown> = {},
) =>
  ok(user, 'PUT', `/api/notebook/notes/daily/${area}/${date}`, {
    body: { id: ulid(), ...body },
  });

const createTask = (user: string, over: Record<string, unknown> = {}) =>
  ok(user, 'POST', '/api/notebook/tasks', {
    body: { id: ulid(), area: 'work', title: 'Task', ...over },
  });

async function listAll(
  user: string,
  path: string,
  query: Record<string, string> = {},
  limit = 7,
): Promise<Entity[]> {
  const items: Entity[] = [];
  let cursor: string | undefined;
  do {
    const page = await ok(user, 'GET', path, {
      query: {
        ...query,
        limit: String(limit),
        ...(cursor ? { cursor } : {}),
      },
    });
    items.push(...(page.items as Entity[]));
    cursor = page.nextCursor as string | undefined;
  } while (cursor);
  return items;
}

async function syncAll(user: string): Promise<Entity[]> {
  const changes: Entity[] = [];
  let cursor: string | undefined;
  do {
    const page = await ok(user, 'GET', '/api/notebook/sync/changes', {
      query: { limit: '25', ...(cursor ? { cursor } : {}) },
    });
    changes.push(...(page.changes as Entity[]));
    cursor = page.nextCursor as string | undefined;
  } while (cursor);
  return changes;
}

const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

async function inBatches<T>(
  count: number,
  make: (i: number) => Promise<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < count; i += 20) {
    const batch = Array.from({ length: Math.min(20, count - i) }, (_, j) =>
      make(i + j),
    );
    out.push(...(await Promise.all(batch)));
  }
  return out;
}

function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe('Notebook over HTTP, two users (DynamoDB Local)', () => {
  const doc = createLocalDocClient();
  let tableName: string;
  let previousTable: string | undefined;

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('notebook-http');
    previousTable = process.env.DATA_TABLE_NAME;
    process.env.DATA_TABLE_NAME = tableName;
    setDocClient(doc);
  });

  afterAll(async () => {
    setDocClient(undefined);
    if (previousTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = previousTable;
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it("B cannot read, change, list, search or sync A's notes and tasks", async () => {
    const page = await createPage(A, {
      title: 'A plan',
      bodyMarkdown: 'aardvark secret',
    });
    await createPage(A, { title: 'A second page' });
    const daily = await putDaily(A, 'work', '2026-10-01', {
      bodyMarkdown: 'aardvark daily',
    });
    const task = await createTask(A, {
      title: 'aardvark task',
      noteId: page.id,
    });
    await createTask(A, { title: 'A second task' });

    const notesCursor = (
      await ok(A, 'GET', '/api/notebook/notes', { query: { limit: '1' } })
    ).nextCursor as string;
    const tasksCursor = (
      await ok(A, 'GET', '/api/notebook/tasks', { query: { limit: '1' } })
    ).nextCursor as string;
    const syncCursor = (
      await ok(A, 'GET', '/api/notebook/sync/changes', {
        query: { limit: '1' },
      })
    ).nextCursor as string;
    expect([notesCursor, tasksCursor, syncCursor].every(Boolean)).toBe(true);

    const notePath = `/api/notebook/notes/${page.id}`;
    const taskPath = `/api/notebook/tasks/${task.id}`;
    const attempts: [string, string, Parameters<typeof call>[3]][] = [
      ['GET', notePath, {}],
      ['PUT', notePath, { body: { title: 'B was here' }, ifMatch: '*' }],
      ['PUT', notePath, { body: { version: 1, title: 'B was here' } }],
      ['DELETE', notePath, { ifMatch: '*' }],
      ['DELETE', notePath, { body: { version: 1 } }],
      ['GET', taskPath, {}],
      ['PUT', taskPath, { body: { title: 'B was here' }, ifMatch: '*' }],
      ['PUT', taskPath, { body: { version: 1, title: 'B was here' } }],
      ['POST', `${taskPath}/complete`, { ifMatch: '*' }],
      ['POST', `${taskPath}/reopen`, { ifMatch: '*' }],
      ['DELETE', taskPath, { ifMatch: '*' }],
    ];
    for (const [method, path, opts] of attempts) {
      const res = await call(B, method, path, opts);
      expect(res.status, `B ${method} ${path} ${JSON.stringify(opts)}`).toBe(
        404,
      );
    }

    expect(
      await ok(B, 'GET', '/api/notebook/notes/daily/work/2026-10-01'),
    ).toMatchObject({ exists: false });
    const bDaily = await putDaily(B, 'work', '2026-10-01', {
      bodyMarkdown: 'B daily',
    });
    expect(bDaily.id).not.toBe(daily.id);

    const linkToA = await call(B, 'POST', '/api/notebook/tasks', {
      body: { id: ulid(), area: 'work', title: 'B task', noteId: page.id },
    });
    expect(linkToA.status).toBe(400);

    // Reusing A's ULID gives B a separate row or a refusal, never A's row.
    const sameId = await call(B, 'POST', '/api/notebook/notes', {
      body: { id: page.id, area: 'work', type: 'page', title: 'B copy' },
    });
    expect([201, 409]).toContain(sameId.status);

    const bNotes = await listAll(B, '/api/notebook/notes');
    expect(bNotes.every((n) => n.userId === B)).toBe(true);
    expect(ids(bNotes)).not.toContain(daily.id);
    expect(await listAll(B, '/api/notebook/tasks')).toEqual([]);

    for (const [path, cursor] of [
      ['/api/notebook/notes', notesCursor],
      ['/api/notebook/tasks', tasksCursor],
      ['/api/notebook/sync/changes', syncCursor],
    ] as const) {
      const res = await call(B, 'GET', path, { query: { cursor } });
      expect(res.status, `B ${path} with A's cursor`).toBe(400);
    }

    const search = await ok(B, 'POST', '/api/notebook/search', {
      body: { q: 'aardvark' },
    });
    expect(search).toEqual({ notes: [], tasks: [] });

    const bSync = await syncAll(B);
    expect(bSync.length).toBeGreaterThan(0);
    expect(
      bSync.every((c) => (c.entity as { userId?: string })?.userId === B),
    ).toBe(true);

    expect(await ok(A, 'GET', notePath)).toMatchObject({
      version: 1,
      title: 'A plan',
      bodyMarkdown: 'aardvark secret',
      deleted: false,
    });
    expect(await ok(A, 'GET', taskPath)).toMatchObject({
      version: 1,
      title: 'aardvark task',
      status: 'todo',
    });
    expect(
      await ok(A, 'GET', '/api/notebook/notes/daily/work/2026-10-01'),
    ).toMatchObject({ id: daily.id, bodyMarkdown: 'aardvark daily' });
  });

  it('150+ notes and tasks page completely under every filter, and search reaches all of them', async () => {
    const notes = await inBatches(160, (i) =>
      i % 2 === 0
        ? putDaily(A, i % 4 === 0 ? 'work' : 'personal', day(i), {
            bodyMarkdown: `daily marker${i}x`,
          })
        : createPage(A, {
            area: i % 3 === 0 ? 'personal' : 'work',
            title: `Page ${i}`,
            bodyMarkdown: `page marker${i}x`,
          }),
    );
    const statuses = ['todo', 'in_progress', 'done', 'dropped'] as const;
    const priorities = ['high', 'med', 'low'] as const;
    const tasks = await inBatches(160, async (i) => {
      const created = await createTask(A, {
        area: i % 2 === 0 ? 'work' : 'personal',
        title: `Task marker${i}x`,
        priority: priorities[i % 3],
        ...(i % 5 === 0
          ? { someday: true }
          : i % 5 === 1
            ? {}
            : { startDate: day(i % 40) }),
      });
      const status = statuses[i % 4]!;
      if (status === 'todo') return created;
      return ok(A, 'PUT', `/api/notebook/tasks/${created.id}`, {
        body: { status },
        ifMatch: `"${created.version}"`,
      });
    });
    // B's rows share the table and must never leak into A's pages.
    await createPage(B, { title: 'B page' });
    await createTask(B, { title: 'B task' });

    const noteFilters: [Record<string, string>, (n: Entity) => boolean][] = [
      [{}, () => true],
      [{ area: 'work' }, (n) => n.area === 'work'],
      [{ area: 'personal' }, (n) => n.area === 'personal'],
      [{ type: 'daily' }, (n) => n.type === 'daily'],
      [{ type: 'page' }, (n) => n.type === 'page'],
      [
        { area: 'personal', type: 'daily' },
        (n) => n.area === 'personal' && n.type === 'daily',
      ],
      [
        { area: 'work', type: 'page' },
        (n) => n.area === 'work' && n.type === 'page',
      ],
      [
        { from: day(20), to: day(90) },
        (n) =>
          n.type === 'daily' &&
          (n.date as string) >= day(20) &&
          (n.date as string) <= day(90),
      ],
    ];
    for (const [query, keep] of noteFilters) {
      const got = await listAll(A, '/api/notebook/notes', query);
      expect(got.length, JSON.stringify(query)).toBe(new Set(ids(got)).size);
      expect(ids(got), JSON.stringify(query)).toEqual(ids(notes.filter(keep)));
    }

    const open = (t: Entity) =>
      t.status === 'todo' || t.status === 'in_progress';
    const start = (t: Entity) => t.startDate as string | null;
    const taskFilters: [Record<string, string>, (t: Entity) => boolean][] = [
      [{}, () => true],
      [{ area: 'personal' }, (t) => t.area === 'personal'],
      [{ status: 'done' }, (t) => t.status === 'done'],
      [{ open: 'true' }, open],
      // `open=false` is no filter, not "closed only".
      [{ open: 'false' }, () => true],
      [{ priority: 'high' }, (t) => t.priority === 'high'],
      [{ someday: 'true' }, (t) => t.someday === true],
      [{ someday: 'false' }, (t) => t.someday === false],
      [{ startOn: day(12) }, (t) => start(t) === day(12)],
      [
        { startAfter: day(12) },
        (t) => !t.someday && start(t) !== null && start(t)! > day(12),
      ],
      [
        { startOnOrBefore: day(12) },
        (t) => !t.someday && (start(t) === null || start(t)! <= day(12)),
      ],
      [
        { area: 'work', open: 'true', startOnOrBefore: day(30) },
        (t) =>
          t.area === 'work' &&
          open(t) &&
          !t.someday &&
          (start(t) === null || start(t)! <= day(30)),
      ],
    ];
    for (const [query, keep] of taskFilters) {
      const got = await listAll(A, '/api/notebook/tasks', query);
      expect(got.length, JSON.stringify(query)).toBe(new Set(ids(got)).size);
      expect(ids(got), JSON.stringify(query)).toEqual(ids(tasks.filter(keep)));
    }

    // Oldest, newest and a few between: search is not one page of the list.
    for (const i of [0, 1, 2, 77, 158, 159]) {
      const hits = await ok(A, 'POST', '/api/notebook/search', {
        body: { q: `marker${i}x` },
      });
      expect(ids(hits.notes as Entity[]), `note marker${i}x`).toEqual([
        notes[i]!.id,
      ]);
      expect(ids(hits.tasks as Entity[]), `task marker${i}x`).toEqual([
        tasks[i]!.id,
      ]);
    }
  });

  it('daily notes: delete frees the day, recreate takes it, and only pages move area', async () => {
    const first = await putDaily(A, 'work', '2026-10-02', {
      bodyMarkdown: 'first',
    });
    await ok(A, 'DELETE', `/api/notebook/notes/${first.id}`, {
      ifMatch: `"${first.version}"`,
    });
    expect(
      await ok(A, 'GET', '/api/notebook/notes/daily/work/2026-10-02'),
    ).toMatchObject({ exists: false });

    const second = await putDaily(A, 'work', '2026-10-02', {
      bodyMarkdown: 'second',
    });
    expect(second.id).not.toBe(first.id);
    expect(
      await ok(A, 'GET', '/api/notebook/notes/daily/work/2026-10-02'),
    ).toMatchObject({ id: second.id, bodyMarkdown: 'second', version: 1 });
    expect(
      (await call(A, 'GET', `/api/notebook/notes/${first.id}`)).status,
    ).toBe(404);

    const racers = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(A, 'PUT', '/api/notebook/notes/daily/personal/2026-10-02', {
          body: { id: ulid(), bodyMarkdown: 'race' },
        }),
      ),
    );
    expect(racers.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      racers.filter((r) => r.status === 409).map((r) => r.body.error),
    ).toEqual(Array(5).fill('daily_taken'));

    const moveDaily = await call(A, 'PUT', `/api/notebook/notes/${second.id}`, {
      body: { area: 'personal' },
      ifMatch: '"1"',
    });
    expect(moveDaily.status).toBe(400);
    expect(moveDaily.body).toMatchObject({ fields: { area: 'immutable' } });

    const page = await createPage(A, { title: 'Moves' });
    const moved = await ok(A, 'PUT', `/api/notebook/notes/${page.id}`, {
      body: { area: 'personal' },
      ifMatch: '"1"',
    });
    expect(moved).toMatchObject({ area: 'personal', version: 2 });
    expect(
      ids(await listAll(A, '/api/notebook/notes', { area: 'work' })),
    ).not.toContain(page.id);
    expect(
      ids(await listAll(A, '/api/notebook/notes', { area: 'personal' })),
    ).toContain(page.id);
  });

  it('versions: If-Match alone, stale If-Match is 412, stale body is 409, delete needs a version', async () => {
    const note = await createPage(A, { title: 'v1' });
    const path = `/api/notebook/notes/${note.id}`;

    const v2 = await call(A, 'PUT', path, {
      body: { title: 'v2' },
      ifMatch: '"1"',
    });
    expect(v2.status).toBe(200);
    expect(v2.etag).toBe('"2"');

    const staleHeader = await call(A, 'PUT', path, {
      body: { title: 'lost' },
      ifMatch: '"1"',
    });
    expect(staleHeader.status).toBe(412);
    expect(staleHeader.body).toMatchObject({
      error: 'precondition_failed',
      currentVersion: 2,
    });

    const staleBody = await call(A, 'PUT', path, {
      body: { version: 1, title: 'lost' },
    });
    expect(staleBody.status).toBe(409);
    expect(staleBody.body).toMatchObject({ currentVersion: 2 });

    expect((await call(A, 'PUT', path, { body: { title: 'x' } })).status).toBe(
      400,
    );
    expect((await call(A, 'DELETE', path)).status).toBe(400);
    expect(
      (await call(A, 'DELETE', path, { body: { version: 1 } })).status,
    ).toBe(409);
    expect((await call(A, 'GET', path)).body).toMatchObject({
      title: 'v2',
      version: 2,
    });

    const deleted = await call(A, 'DELETE', path, { body: { version: 2 } });
    expect(deleted.status).toBe(200);
    expect((await call(A, 'GET', path)).status).toBe(404);

    const task = await createTask(A);
    expect(
      (
        await call(A, 'DELETE', `/api/notebook/tasks/${task.id}`, {
          ifMatch: '*',
        })
      ).status,
    ).toBe(200);
  });

  it('sync: a since past the tombstone horizon is 410, and a cursor only works with its own since', async () => {
    await createPage(A, { title: 'one' });
    await createPage(A, { title: 'two' });

    const stale = new Date(
      Date.now() - (SYNC_TOMBSTONE_TTL_DAYS + 2) * 86_400_000,
    ).toISOString();
    const gone = await call(A, 'GET', '/api/notebook/sync/changes', {
      query: { since: stale },
    });
    expect(gone.status).toBe(410);
    expect(gone.body).toMatchObject({ error: 'resync_required' });

    const first = await ok(A, 'GET', '/api/notebook/sync/changes', {
      query: { limit: '1' },
    });
    expect(first.nextCursor).toBeTruthy();
    const reused = await call(A, 'GET', '/api/notebook/sync/changes', {
      query: {
        since: new Date(Date.now() + 60_000).toISOString(),
        cursor: first.nextCursor as string,
        limit: '1',
      },
    });
    expect(reused.status).toBe(400);
  });
});

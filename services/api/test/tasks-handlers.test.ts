import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { registerProductionSyncAdapters } from '../src/sync/adapters.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createSyncRoutes } from '../src/sync/handlers.js';
import { SyncLedger } from '../src/sync/ledger.js';
import { TasksRepository, sortTasksForList } from '../src/tasks/repository.js';
import { createTaskRoutes } from '../src/tasks/handlers.js';
import { NotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import type { Task } from '@gagnechris/shared';

const TABLE = 'gagnechris-tasks-test';
const USER = 'user-tasks-1';
const OTHER = 'user-tasks-2';
const TASK_A = '01ARZ3NDEKTSV4RRFFQ48JMTA1';
const TASK_B = '01ARZ3NDEKTSV4RRFFQ48JMTA2';
const TASK_C = '01ARZ3NDEKTSV4RRFFQ48JMTA3';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ48JMN01';

function adminEvent(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  query?: Record<string, string>,
  sub = USER,
) {
  return makeEvent(method, path, {
    body,
    headers,
    query,
    jwtClaims: { sub },
  });
}

function baseTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    userId: USER,
    area: 'work',
    description: '',
    priority: 'med',
    status: 'todo',
    dueDate: null,
    startDate: null,
    someday: false,
    completedAt: null,
    noteId: null,
    tags: [],
    version: 1,
    createdAt: '2026-10-02T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
    deleted: false,
    ...overrides,
  };
}

describe('sortTasksForList', () => {
  it('orders carried-over, then start date, then priority', () => {
    const items = [
      baseTask({ id: 'c', title: 'undated high', priority: 'high' }),
      baseTask({ id: 'b', title: 'starts tomorrow', startDate: '2026-10-03' }),
      baseTask({
        id: 'a',
        title: 'carried low',
        startDate: '2026-10-01',
        priority: 'low',
      }),
      baseTask({
        id: 'd',
        title: 'carried high',
        startDate: '2026-09-30',
        priority: 'high',
      }),
    ];
    expect(sortTasksForList(items, '2026-10-02').map((t) => t.id)).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
  });
});

describe('tasks handlers', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerProductionSyncAdapters();
  });

  it("POST /tasks/batch returns the caller's live tasks in order and caps the ids", async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createTaskRoutes(repo);
    const create = (id: string, title: string, sub = USER) =>
      dispatchRoutes(
        routes,
        adminEvent(
          'POST',
          '/api/notebook/tasks',
          { id, area: 'work', title },
          undefined,
          undefined,
          sub,
        ),
        'POST',
        '/api/notebook/tasks',
      );
    await create(TASK_A, 'Alpha');
    await create(TASK_B, 'Beta');
    await create(TASK_C, 'Other user', OTHER);
    const batch = (ids: unknown) =>
      dispatchRoutes(
        routes,
        adminEvent('POST', '/api/notebook/tasks/batch', { ids }),
        'POST',
        '/api/notebook/tasks/batch',
      );

    const res = await batch([TASK_B, TASK_C, TASK_A]);
    expect(res?.statusCode).toBe(200);
    expect(
      JSON.parse(res!.body as string).items.map((t: Task) => t.title),
    ).toEqual(['Beta', 'Alpha']);

    expect((await batch([]))?.statusCode).toBe(400);
    expect((await batch(['not-a-ulid']))?.statusCode).toBe(400);
    expect(
      (await batch(Array.from({ length: 101 }, () => TASK_A)))?.statusCode,
    ).toBe(400);
  });

  it('round-trips startDate and someday through create, get, and If-Match updates', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createTaskRoutes(repo);
    const path = `/api/notebook/tasks/${TASK_C}`;
    const put = (body: unknown, ifMatch: string) =>
      dispatchRoutes(
        routes,
        adminEvent('PUT', path, body, { 'if-match': ifMatch }),
        'PUT',
        path,
      );

    const created = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_C,
        area: 'work',
        title: 'Plan offsite',
        startDate: '2026-10-05',
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(created?.statusCode).toBe(201);
    expect(created?.headers?.ETag).toBe('"1"');
    expect(JSON.parse(created!.body as string)).toMatchObject({
      startDate: '2026-10-05',
      someday: false,
      dueDate: null,
    });

    const got = await dispatchRoutes(
      routes,
      adminEvent('GET', path),
      'GET',
      path,
    );
    expect(JSON.parse(got!.body as string)).toMatchObject({
      startDate: '2026-10-05',
      someday: false,
    });

    const someday = await put({ someday: true }, '"1"');
    expect(someday?.statusCode).toBe(200);
    expect(someday?.headers?.ETag).toBe('"2"');
    expect(JSON.parse(someday!.body as string)).toMatchObject({
      startDate: null,
      someday: true,
      version: 2,
    });

    const stale = await put({ startDate: '2026-10-09' }, '"1"');
    expect(stale?.statusCode).toBe(412);

    const both = await put({ someday: true, startDate: '2026-10-09' }, '"2"');
    expect(both?.statusCode).toBe(400);

    const scheduled = await put({ startDate: '2026-10-09' }, '"2"');
    expect(scheduled?.statusCode).toBe(200);
    expect(scheduled?.headers?.ETag).toBe('"3"');
    expect(JSON.parse(scheduled!.body as string)).toMatchObject({
      startDate: '2026-10-09',
      someday: false,
      version: 3,
    });

    const list = async (query: Record<string, string>) => {
      const res = await dispatchRoutes(
        routes,
        adminEvent('GET', '/api/notebook/tasks', undefined, undefined, query),
        'GET',
        '/api/notebook/tasks',
      );
      expect(res?.statusCode).toBe(200);
      return (JSON.parse(res!.body as string) as { items: Task[] }).items.map(
        (t) => t.id,
      );
    };
    expect(await list({ startAfter: '2026-10-08' })).toEqual([TASK_C]);
    expect(await list({ startOnOrBefore: '2026-10-08' })).toEqual([]);
    expect(await list({ someday: 'true' })).toEqual([]);
  });

  it('creates, gets, updates with If-Match, completes, reopens, and lists', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createTaskRoutes(repo);

    const created = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Ship Tasks API',
        priority: 'high',
        dueDate: '2026-10-01',
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(created?.statusCode).toBe(201);
    expect(created?.headers?.ETag).toBe('"1"');
    const createdBody = JSON.parse(created!.body as string);
    expect(createdBody).toMatchObject({
      id: TASK_A,
      title: 'Ship Tasks API',
      status: 'todo',
      completedAt: null,
    });

    const got = await dispatchRoutes(
      routes,
      adminEvent('GET', `/api/notebook/tasks/${TASK_A}`),
      'GET',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(got?.statusCode).toBe(200);
    expect(got?.headers?.ETag).toBe('"1"');

    const conflict = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/tasks/${TASK_A}`,
        { version: 1, title: 'stale' },
        { 'if-match': '"0"' },
      ),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(conflict?.statusCode).toBe(412);

    const updated = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/tasks/${TASK_A}`,
        { version: 1, title: 'Updated title' },
        { 'if-match': '"1"' },
      ),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(updated?.statusCode).toBe(200);
    expect(updated?.headers?.ETag).toBe('"2"');

    const completed = await dispatchRoutes(
      routes,
      adminEvent(
        'POST',
        `/api/notebook/tasks/${TASK_A}/complete`,
        { version: 2 },
        { 'if-match': '"2"' },
      ),
      'POST',
      `/api/notebook/tasks/${TASK_A}/complete`,
    );
    expect(completed?.statusCode).toBe(200);
    expect(JSON.parse(completed!.body as string)).toMatchObject({
      status: 'done',
      completedAt: '2026-10-02T12:00:00.000Z',
    });
    expect(completed?.headers?.ETag).toBe('"3"');

    const reopened = await dispatchRoutes(
      routes,
      adminEvent(
        'POST',
        `/api/notebook/tasks/${TASK_A}/reopen`,
        { version: 3 },
        { 'if-match': '"3"' },
      ),
      'POST',
      `/api/notebook/tasks/${TASK_A}/reopen`,
    );
    expect(reopened?.statusCode).toBe(200);
    expect(JSON.parse(reopened!.body as string)).toMatchObject({
      status: 'todo',
      completedAt: null,
    });

    await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_B,
        area: 'work',
        title: 'Later',
        dueDate: '2026-10-05',
        priority: 'low',
      }),
      'POST',
      '/api/notebook/tasks',
    );

    const listed = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/tasks', undefined, undefined, {
        area: 'work',
        status: 'todo',
      }),
      'GET',
      '/api/notebook/tasks',
    );
    expect(listed?.statusCode).toBe(200);
    const items = JSON.parse(listed!.body as string).items as Array<{
      id: string;
    }>;
    expect(items.map((t) => t.id)).toEqual([TASK_A, TASK_B]);
  });

  it('lists tasks for a note via GSI2; cross-user GET is 404; sync typed task', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const notes = new NotesRepository(doc, TABLE);
    const routes = [
      ...createTaskRoutes(repo, notes),
      ...createNoteRoutes(notes),
      ...createSyncRoutes(
        new SyncLedger(doc, TABLE, () => '2026-10-02T13:00:00.000Z'),
      ),
    ];

    const noteCreated = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/notes', {
        id: NOTE_ID,
        area: 'personal',
        type: 'page',
        title: 'Linked page',
      }),
      'POST',
      '/api/notebook/notes',
    );
    expect(noteCreated?.statusCode).toBe(201);

    await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_C,
        area: 'personal',
        title: 'Linked',
        noteId: NOTE_ID,
      }),
      'POST',
      '/api/notebook/tasks',
    );

    const byNote = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/tasks', undefined, undefined, {
        noteId: NOTE_ID,
      }),
      'GET',
      '/api/notebook/tasks',
    );
    expect(byNote?.statusCode).toBe(200);
    expect(JSON.parse(byNote!.body as string).items).toHaveLength(1);

    const other = await dispatchRoutes(
      routes,
      adminEvent(
        'GET',
        `/api/notebook/tasks/${TASK_C}`,
        undefined,
        undefined,
        undefined,
        OTHER,
      ),
      'GET',
      `/api/notebook/tasks/${TASK_C}`,
    );
    expect(other?.statusCode).toBe(404);

    const deleted = await dispatchRoutes(
      routes,
      adminEvent(
        'DELETE',
        `/api/notebook/tasks/${TASK_C}`,
        { version: 1 },
        { 'if-match': '"1"' },
      ),
      'DELETE',
      `/api/notebook/tasks/${TASK_C}`,
    );
    expect(deleted?.statusCode).toBe(200);
    expect(JSON.parse(deleted!.body as string).deleted).toBe(true);

    const sync = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/sync/changes'),
      'GET',
      '/api/notebook/sync/changes',
    );
    expect(sync?.statusCode).toBe(200);
    const changes = JSON.parse(sync!.body as string).changes as Array<{
      type: string;
      id: string;
      deleted: boolean;
    }>;
    expect(changes.some((c) => c.type === 'task')).toBe(true);
    expect(changes.find((c) => c.id === TASK_C)).toMatchObject({
      type: 'task',
      deleted: true,
    });
  });

  it('accepts If-Match alone on PUT and DELETE; stale If-Match is 412', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createTaskRoutes(repo, new NotesRepository(doc, TABLE));
    await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Header only',
      }),
      'POST',
      '/api/notebook/tasks',
    );

    const updated = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/tasks/${TASK_A}`,
        { title: 'Renamed' },
        { 'if-match': '"1"' },
      ),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(updated?.statusCode).toBe(200);
    expect(updated?.headers?.ETag).toBe('"2"');
    expect(JSON.parse(updated!.body as string).title).toBe('Renamed');

    const stale = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/tasks/${TASK_A}`,
        { title: 'Stale' },
        { 'if-match': '"1"' },
      ),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(stale?.statusCode).toBe(412);

    const missing = await dispatchRoutes(
      routes,
      adminEvent('PUT', `/api/notebook/tasks/${TASK_A}`, { title: 'No ver' }),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(missing?.statusCode).toBe(400);

    const deleted = await dispatchRoutes(
      routes,
      adminEvent('DELETE', `/api/notebook/tasks/${TASK_A}`, undefined, {
        'if-match': '"2"',
      }),
      'DELETE',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(deleted?.statusCode).toBe(200);
    expect(JSON.parse(deleted!.body as string).deleted).toBe(true);
  });

  it('rejects a noteId that is not a live note owned by the caller', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const notes = new NotesRepository(doc, TABLE);
    const routes = [
      ...createTaskRoutes(repo, notes),
      ...createNoteRoutes(notes),
    ];

    const notUlid = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Bad link',
        noteId: 'not-a-note',
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(notUlid?.statusCode).toBe(400);

    const unknown = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Dangling link',
        noteId: NOTE_ID,
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(unknown?.statusCode).toBe(400);
    expect(JSON.parse(unknown!.body as string).fields).toEqual({
      noteId: 'not_found',
    });

    // Another user's note is not linkable.
    await dispatchRoutes(
      routes,
      adminEvent(
        'POST',
        '/api/notebook/notes',
        { id: NOTE_ID, area: 'work', type: 'page', title: 'Theirs' },
        undefined,
        undefined,
        OTHER,
      ),
      'POST',
      '/api/notebook/notes',
    );
    const crossUser = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Cross-user link',
        noteId: NOTE_ID,
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(crossUser?.statusCode).toBe(400);

    const created = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/tasks', {
        id: TASK_A,
        area: 'work',
        title: 'Unlinked',
      }),
      'POST',
      '/api/notebook/tasks',
    );
    expect(created?.statusCode).toBe(201);
    const relink = await dispatchRoutes(
      routes,
      adminEvent('PUT', `/api/notebook/tasks/${TASK_A}`, {
        version: 1,
        noteId: NOTE_ID,
      }),
      'PUT',
      `/api/notebook/tasks/${TASK_A}`,
    );
    expect(relink?.statusCode).toBe(400);
  });

  it('a dropped task is closed: open and Today lists skip it, status=dropped finds it, reopen restores it', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const notes = new NotesRepository(doc, TABLE);
    const routes = [
      ...createTaskRoutes(repo, notes),
      ...createNoteRoutes(notes),
    ];
    const call = async (
      method: string,
      path: string,
      body?: unknown,
      query?: Record<string, string>,
    ) => {
      const res = await dispatchRoutes(
        routes,
        adminEvent(method, path, body, undefined, query),
        method,
        path,
      );
      return { status: res?.statusCode, body: JSON.parse(res!.body as string) };
    };
    const ids = async (query: Record<string, string>) =>
      (
        (await call('GET', '/api/notebook/tasks', undefined, query)).body
          .items as Task[]
      ).map((t) => t.id);

    await call('POST', '/api/notebook/notes', {
      id: NOTE_ID,
      area: 'work',
      type: 'page',
      title: 'Home',
    });
    await call('POST', '/api/notebook/tasks', {
      id: TASK_A,
      area: 'work',
      title: 'Drop me',
      noteId: NOTE_ID,
    });
    await call('POST', '/api/notebook/tasks', {
      id: TASK_B,
      area: 'work',
      title: 'Keep me',
      noteId: NOTE_ID,
    });

    const dropped = await call('PUT', `/api/notebook/tasks/${TASK_A}`, {
      version: 1,
      status: 'dropped',
    });
    expect(dropped.status).toBe(200);
    expect(dropped.body).toMatchObject({
      status: 'dropped',
      completedAt: null,
      deleted: false,
    });

    const today = { open: 'true', startOnOrBefore: '2026-10-02' };
    expect(await ids(today)).toEqual([TASK_B]);
    expect(await ids({ ...today, area: 'work' })).toEqual([TASK_B]);
    expect(await ids({ open: 'true', noteId: NOTE_ID })).toEqual([TASK_B]);
    expect(await ids({ status: 'dropped' })).toEqual([TASK_A]);
    expect((await ids({})).sort()).toEqual([TASK_A, TASK_B].sort());

    const reopened = await call(
      'POST',
      `/api/notebook/tasks/${TASK_A}/reopen`,
      { version: 2 },
    );
    expect(reopened.body).toMatchObject({ status: 'todo' });
    expect((await ids(today)).sort()).toEqual([TASK_A, TASK_B].sort());
  });
});

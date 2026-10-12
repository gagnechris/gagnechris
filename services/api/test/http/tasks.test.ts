import { describe, expect, it } from 'vitest';
import { NOTEBOOK_TEXT_MAX_BYTES } from '@gagnechris/shared';
import { notebookUser } from './support/claims.js';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-a-tasks';
const USER_B = 'user-b-tasks';
const TASK_1 = '01ARZ3NDEKTSV4RRFFQ69G5TA1';
const TASK_2 = '01ARZ3NDEKTSV4RRFFQ69G5TA2';
const TASK_3 = '01ARZ3NDEKTSV4RRFFQ69G5TA3';
const TASK_4 = '01ARZ3NDEKTSV4RRFFQ69G5TA4';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5N01';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5N02';
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

type Task = { id: string; version: number; [key: string]: unknown };
type Body = Record<string, unknown>;

const h = useApi('tasks-api');
const { call, ok } = apiCalls(h, { user: USER_A });

const createTask = (body: Body, user = USER_A) =>
  ok<Task>('POST', '/api/notebook/tasks', {
    user,
    body: { area: 'work', ...body },
  });

const listIds = async (query: Record<string, string>, user = USER_A) =>
  (
    await ok<{ items: Task[] }>('GET', '/api/notebook/tasks', {
      user,
      query,
    })
  ).items.map((t) => t.id);

const createPage = (id: string, user = USER_A) =>
  ok('POST', '/api/notebook/notes', {
    body: { id, area: 'work', type: 'page', title: 'Linked' },
    user,
  });

const badBody = (fields: Record<string, string>) => ({
  error: 'bad_request',
  message: 'Invalid request body',
  fields,
});

const badQuery = (fields: Record<string, string>) => ({
  error: 'bad_request',
  message: 'Invalid query parameters',
  fields,
});

describe('tasks (DynamoDB Local)', () => {
  it('isolates owners, filters due ranges, lists by note, and feeds typed task changes', async () => {
    await ok('POST', '/api/notebook/notes', {
      body: { id: NOTE_ID, area: 'work', type: 'page', title: 'Linked' },
    });

    const overdue = await createTask({
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

    await createTask({
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

    await createTask({
      id: TASK_3,
      area: 'work',
      title: 'Undated',
      description: '',
      priority: 'low',
      status: 'todo',
      tags: [],
    });

    expect(
      (await call('GET', `/api/notebook/tasks/${TASK_1}`, { user: USER_B }))
        .status,
    ).toBe(404);

    expect(
      await listIds({
        area: 'work',
        status: 'todo',
        dueBefore: '2026-10-01',
      }),
    ).toEqual([TASK_1]);

    expect(
      await listIds({
        area: 'work',
        status: 'todo',
        dueOn: '2026-10-05',
      }),
    ).toEqual([TASK_2]);

    expect(await listIds({ noteId: NOTE_ID })).toEqual([TASK_2]);

    expect(await listIds({ area: 'work', status: 'todo' })).toEqual([
      TASK_1,
      TASK_2,
      TASK_3,
    ]);

    const beforeComplete = new Date().toISOString();
    const done = await ok('POST', `/api/notebook/tasks/${TASK_1}/complete`, {
      body: { version: 1 },
    });
    const afterComplete = new Date().toISOString();
    expect(done.status).toBe('done');
    expect(typeof done.completedAt).toBe('string');
    expect((done.completedAt as string) >= beforeComplete).toBe(true);
    expect((done.completedAt as string) <= afterComplete).toBe(true);

    const reopened = await ok('POST', `/api/notebook/tasks/${TASK_1}/reopen`, {
      body: { version: 2 },
    });
    expect(reopened.status).toBe('todo');
    expect(reopened.completedAt).toBeNull();

    const feed = await ok<{ changes: Array<{ id: string; type: string }> }>(
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
    const created = await createTask({
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
    expect(await ok('GET', `/api/notebook/tasks/${TASK_1}`)).toEqual(created);

    const someday = await ok('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, someday: true },
    });
    expect(someday).toMatchObject({
      version: 2,
      startDate: null,
      someday: true,
    });
    const stale = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, startDate: '2026-10-07' },
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'version_conflict' });

    const back = await ok('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 2, startDate: '2026-10-07' },
    });
    expect(back).toMatchObject({
      version: 3,
      startDate: '2026-10-07',
      someday: false,
    });
    expect(await ok('GET', `/api/notebook/tasks/${TASK_1}`)).toEqual(back);
  });

  it("batch reads live tasks in request order, leaving out deleted, unknown and other users' ids", async () => {
    const base = {
      area: 'work',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    };
    await createTask({ ...base, id: TASK_1, title: 'One' });
    await createTask({ ...base, id: TASK_2, title: 'Two' });
    await createTask({ ...base, id: TASK_3, title: 'B' }, USER_B);
    await createTask({ ...base, id: TASK_4, title: 'Four' });
    await ok('DELETE', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1 },
    });
    const unknown = '01ARZ3NDEKTSV4RRFFQ69G5TA9';

    const got = await ok<{ items: Task[] }>(
      'POST',
      '/api/notebook/tasks/batch',
      {
        body: { ids: [TASK_4, TASK_2, unknown, TASK_1, TASK_3, TASK_2] },
      },
    );
    expect(got.items.map((t) => t.title)).toEqual(['Four', 'Two']);
    const forB = await ok<{ items: Task[] }>(
      'POST',
      '/api/notebook/tasks/batch',
      { user: USER_B, body: { ids: [TASK_3] } },
    );
    expect(forB.items).toMatchObject([{ id: TASK_3, title: 'B' }]);

    const batch = (ids: unknown) =>
      call('POST', '/api/notebook/tasks/batch', { body: { ids } });
    expect((await batch([TASK_2])).etag).toBeUndefined();
    expect(await batch([])).toMatchObject({
      status: 400,
      body: badBody({ ids: 'too_small' }),
    });
    expect(await batch(['not-a-ulid'])).toMatchObject({
      status: 400,
      body: badBody({ 'ids.0': 'invalid_format' }),
    });
    expect(
      await batch(Array.from({ length: 101 }, () => TASK_1)),
    ).toMatchObject({ status: 400, body: badBody({ ids: 'too_big' }) });
    expect(
      await call('POST', '/api/notebook/tasks/batch', { body: {} }),
    ).toMatchObject({ status: 400, body: badBody({ ids: 'invalid_type' }) });
  });

  it('startAfter with startBefore reads only that window of show-on days', async () => {
    const days = ['2026-10-02', '2026-10-03', '2026-10-16', '2026-10-17'];
    for (const [i, startDate] of days.entries()) {
      await createTask({
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
    await createTask({
      id: '01ARZ3NDEKTSV4RRFFQ69G5TC1',
      area: 'work',
      title: 'undated',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    });
    const page = await ok<{ items: Task[] }>('GET', '/api/notebook/tasks', {
      query: {
        area: 'work',
        open: 'true',
        startAfter: '2026-10-02',
        startBefore: '2026-10-17',
      },
    });
    expect(page.items.map((t) => t.title).sort()).toEqual([
      '2026-10-03',
      '2026-10-16',
    ]);
  });

  it('undated reads only open tasks with no show-on date', async () => {
    const base = {
      area: 'personal',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
    };
    await createTask({
      ...base,
      id: '01ARZ3NDEKTSV4RRFFQ69G5TD1',
      title: 'undated',
    });
    await createTask({
      ...base,
      id: '01ARZ3NDEKTSV4RRFFQ69G5TD2',
      title: 'dated',
      startDate: '2026-10-05',
    });
    await createTask({
      ...base,
      id: '01ARZ3NDEKTSV4RRFFQ69G5TD3',
      title: 'someday',
      someday: true,
    });
    expect(
      await listIds({
        area: 'personal',
        open: 'true',
        undated: 'true',
      }),
    ).toEqual(['01ARZ3NDEKTSV4RRFFQ69G5TD1']);

    for (const conflict of <Record<string, string>[]>[
      { someday: 'true' },
      { startOn: '2026-10-05' },
      { startBefore: '2026-10-05' },
    ]) {
      const res = await call('GET', '/api/notebook/tasks', {
        query: { undated: 'true', ...conflict },
      });
      expect(res.status, JSON.stringify(conflict)).toBe(400);
    }
  });
  it('creates with defaults and an ETag, completes and reopens with ETags', async () => {
    const created = await call('POST', '/api/notebook/tasks', {
      body: {
        id: TASK_1,
        area: 'work',
        title: 'Ship Tasks API',
        priority: 'high',
        dueDate: '2026-10-01',
      },
    });
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"1"');
    expect(created.body).toEqual({
      id: TASK_1,
      userId: USER_A,
      area: 'work',
      title: 'Ship Tasks API',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-10-01',
      startDate: null,
      someday: false,
      completedAt: null,
      noteId: null,
      tags: [],
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
      deleted: false,
    });
    const got = await call('GET', `/api/notebook/tasks/${TASK_1}`);
    expect(got).toEqual({ status: 200, etag: '"1"', body: created.body });

    const stale = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, title: 'stale' },
      ifMatch: '"0"',
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toEqual({
      error: 'precondition_failed',
      message: 'Version conflict: expected 0, current 1',
      currentVersion: 1,
      current: created.body,
    });

    const updated = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, title: 'Updated title' },
      ifMatch: '"1"',
    });
    expect(updated.status).toBe(200);
    expect(updated.etag).toBe('"2"');
    expect(updated.body).toEqual({
      ...created.body,
      title: 'Updated title',
      version: 2,
      updatedAt: ISO,
    });

    const completed = await call(
      'POST',
      `/api/notebook/tasks/${TASK_1}/complete`,
      { body: { version: 2 }, ifMatch: '"2"' },
    );
    expect(completed.status).toBe(200);
    expect(completed.etag).toBe('"3"');
    expect(completed.body).toMatchObject({
      status: 'done',
      completedAt: ISO,
      version: 3,
    });

    const reopened = await call(
      'POST',
      `/api/notebook/tasks/${TASK_1}/reopen`,
      {
        ifMatch: '"3"',
      },
    );
    expect(reopened.status).toBe(200);
    expect(reopened.etag).toBe('"4"');
    expect(reopened.body).toMatchObject({
      status: 'todo',
      completedAt: null,
      version: 4,
    });

    const noVersion = await call(
      'POST',
      `/api/notebook/tasks/${TASK_1}/complete`,
    );
    expect(noVersion.status).toBe(400);
    expect(noVersion.body).toEqual({
      error: 'bad_request',
      message: 'Expected version required (If-Match or body.version)',
    });
  });

  it('round-trips startDate and someday through If-Match updates and schedule filters', async () => {
    const path = `/api/notebook/tasks/${TASK_3}`;
    const created = await call('POST', '/api/notebook/tasks', {
      body: {
        id: TASK_3,
        area: 'work',
        title: 'Plan offsite',
        startDate: '2026-10-05',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      startDate: '2026-10-05',
      someday: false,
      dueDate: null,
    });

    const someday = await call('PUT', path, {
      body: { someday: true },
      ifMatch: '"1"',
    });
    expect(someday.status).toBe(200);
    expect(someday.etag).toBe('"2"');
    expect(someday.body).toMatchObject({
      startDate: null,
      someday: true,
      version: 2,
    });

    const stale = await call('PUT', path, {
      body: { startDate: '2026-10-09' },
      ifMatch: '"1"',
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toMatchObject({
      error: 'precondition_failed',
      currentVersion: 2,
      current: someday.body,
    });

    const both = await call('PUT', path, {
      body: { someday: true, startDate: '2026-10-09' },
      ifMatch: '"2"',
    });
    expect(both.status).toBe(400);
    expect(both.body).toEqual(badBody({ startDate: 'custom' }));

    const bothCreate = await call('POST', '/api/notebook/tasks', {
      body: {
        id: TASK_1,
        area: 'work',
        title: 'Both',
        someday: true,
        startDate: '2026-10-09',
      },
    });
    expect(bothCreate.status).toBe(400);
    expect(bothCreate.body).toEqual(badBody({ startDate: 'custom' }));

    const scheduled = await call('PUT', path, {
      body: { startDate: '2026-10-09' },
      ifMatch: '"2"',
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.etag).toBe('"3"');
    expect(scheduled.body).toMatchObject({
      startDate: '2026-10-09',
      someday: false,
      version: 3,
    });

    expect(await listIds({ startAfter: '2026-10-08' })).toEqual([TASK_3]);
    expect(await listIds({ startAfter: '2026-10-09' })).toEqual([]);
    expect(await listIds({ startOn: '2026-10-09' })).toEqual([TASK_3]);
    expect(await listIds({ startOn: '2026-10-08' })).toEqual([]);
    expect(await listIds({ startOnOrBefore: '2026-10-08' })).toEqual([]);
    expect(await listIds({ startOnOrBefore: '2026-10-09' })).toEqual([TASK_3]);
    expect(await listIds({ startBefore: '2026-10-10' })).toEqual([TASK_3]);
    expect(await listIds({ startBefore: '2026-10-09' })).toEqual([]);
    expect(await listIds({ someday: 'true' })).toEqual([]);
    expect(await listIds({ someday: 'false' })).toEqual([TASK_3]);

    await ok('PUT', path, { body: { startDate: null }, ifMatch: '"3"' });
    expect(await listIds({ startOnOrBefore: '2026-10-01' })).toEqual([TASK_3]);
    expect(await listIds({ startBefore: '2026-12-31' })).toEqual([]);
    expect(await listIds({ startAfter: '2026-01-01' })).toEqual([]);
  });

  it('rejects conflicting schedule filters and bad query values with 400 fields', async () => {
    const cases: [Record<string, string>, Record<string, string>][] = [
      [
        { startOn: '2026-10-01', startOnOrBefore: '2026-10-02' },
        { startOn: 'custom' },
      ],
      [
        { startOn: '2026-10-01', startAfter: '2026-10-02' },
        { startOn: 'custom' },
      ],
      [
        { startOnOrBefore: '2026-10-01', startBefore: '2026-10-02' },
        { startOn: 'custom' },
      ],
      [{ someday: 'true', startOn: '2026-10-01' }, { someday: 'custom' }],
      [{ someday: 'true', startAfter: '2026-10-01' }, { someday: 'custom' }],
      [{ startOn: '2026-02-30' }, { startOn: 'custom' }],
      [{ someday: 'yes' }, { someday: 'invalid_value' }],
      [{ status: 'archived' }, { status: 'invalid_value' }],
      [{ limit: '0' }, { limit: 'too_small' }],
    ];
    for (const [query, fields] of cases) {
      const res = await call('GET', '/api/notebook/tasks', { query });
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body, JSON.stringify(query)).toEqual(badQuery(fields));
    }
    const window = await call('GET', '/api/notebook/tasks', {
      query: { startAfter: '2026-10-01', startBefore: '2026-10-09' },
    });
    expect(window.status).toBe(200);
  });

  it('a dropped task is closed: open and Today lists skip it, status=dropped finds it, reopen restores it', async () => {
    await createPage(NOTE_ID);
    await createTask({ id: TASK_1, title: 'Drop me', noteId: NOTE_ID });
    await createTask({ id: TASK_2, title: 'Keep me', noteId: NOTE_ID });

    const dropped = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, status: 'dropped' },
    });
    expect(dropped.status).toBe(200);
    expect(dropped.body).toMatchObject({
      status: 'dropped',
      completedAt: null,
      deleted: false,
      version: 2,
    });

    const today = { open: 'true', startOnOrBefore: '2026-10-02' };
    expect(await listIds(today)).toEqual([TASK_2]);
    expect(await listIds({ ...today, area: 'work' })).toEqual([TASK_2]);
    expect(await listIds({ open: 'true', noteId: NOTE_ID })).toEqual([TASK_2]);
    expect(await listIds({ status: 'dropped' })).toEqual([TASK_1]);
    expect(await listIds({ status: 'dropped', open: 'true' })).toEqual([
      TASK_1,
    ]);
    expect((await listIds({})).sort()).toEqual([TASK_1, TASK_2].sort());

    const reopened = await call(
      'POST',
      `/api/notebook/tasks/${TASK_1}/reopen`,
      {
        body: { version: 2 },
      },
    );
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ status: 'todo', version: 3 });
    expect((await listIds(today)).sort()).toEqual([TASK_1, TASK_2].sort());
  });

  it('rejects a noteId that is not a live note owned by the caller', async () => {
    const notFound = {
      error: 'bad_request',
      message: 'noteId must reference an existing note',
      fields: { noteId: 'not_found' },
    };
    const post = (noteId: unknown) =>
      call('POST', '/api/notebook/tasks', {
        body: { id: TASK_1, area: 'work', title: 'Link', noteId },
      });

    const notUlid = await post('not-a-note');
    expect(notUlid.status).toBe(400);
    expect(notUlid.body).toEqual(badBody({ noteId: 'invalid_format' }));

    const unknown = await post(NOTE_ID);
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual(notFound);

    await createPage(NOTE_ID, USER_B);
    const crossUser = await post(NOTE_ID);
    expect(crossUser.status).toBe(400);
    expect(crossUser.body).toEqual(notFound);

    await createPage(NOTE_ID_2);
    await ok('DELETE', `/api/notebook/notes/${NOTE_ID_2}`, { ifMatch: '"1"' });
    const deletedNote = await post(NOTE_ID_2);
    expect(deletedNote.status).toBe(400);
    expect(deletedNote.body).toEqual(notFound);

    const created = await post(null);
    expect(created.status).toBe(201);
    expect(created.body.noteId).toBeNull();

    const relink = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, noteId: NOTE_ID },
    });
    expect(relink.status).toBe(400);
    expect(relink.body).toEqual(notFound);
    expect(
      (await call('GET', `/api/notebook/tasks/${TASK_1}`)).body,
    ).toMatchObject({ version: 1, noteId: null });

    const missingTask = await call('PUT', `/api/notebook/tasks/${TASK_2}`, {
      body: { version: 1, noteId: NOTE_ID },
    });
    expect(missingTask.status).toBe(404);
    expect(missingTask.body).toEqual({
      error: 'not_found',
      message: `task ${TASK_2} not found`,
    });
  });

  it('a task whose note was deleted stays editable while it resends the same noteId', async () => {
    await createPage(NOTE_ID);
    await createTask({ id: TASK_1, title: 'Linked', noteId: NOTE_ID });
    await ok('DELETE', `/api/notebook/notes/${NOTE_ID}`, { ifMatch: '"1"' });

    const saved = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 1, title: 'Still editable', noteId: NOTE_ID },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      title: 'Still editable',
      noteId: NOTE_ID,
      version: 2,
    });

    const unlinked = await call('PUT', `/api/notebook/tasks/${TASK_1}`, {
      body: { version: 2, noteId: null },
    });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body).toMatchObject({ noteId: null, version: 3 });
  });

  it('If-Match: alone, *, weak, stale, malformed and comma lists', async () => {
    await createTask({ id: TASK_1, title: 'Header only' });
    const path = `/api/notebook/tasks/${TASK_1}`;

    const alone = await call('PUT', path, {
      body: { title: 'Renamed' },
      ifMatch: '"1"',
    });
    expect(alone.status).toBe(200);
    expect(alone.etag).toBe('"2"');
    expect(alone.body).toMatchObject({ title: 'Renamed', version: 2 });

    const star = await call('PUT', path, {
      body: { title: 'Star' },
      ifMatch: '*',
    });
    expect(star.status).toBe(200);
    expect(star.etag).toBe('"3"');
    expect(star.body).toMatchObject({ title: 'Star', version: 3 });

    const weak = await call('PUT', path, {
      body: { title: 'Weak' },
      ifMatch: 'W/"3"',
    });
    expect(weak.status).toBe(200);
    expect(weak.etag).toBe('"4"');

    const staleWeak = await call('PUT', path, {
      body: { title: 'stale' },
      ifMatch: 'W/"3"',
    });
    expect(staleWeak.status).toBe(412);
    expect(staleWeak.body).toEqual({
      error: 'precondition_failed',
      message: 'Version conflict: expected 3, current 4',
      currentVersion: 4,
      current: weak.body,
    });

    // The header wins over a body version that would match.
    const headerWins = await call('PUT', path, {
      body: { version: 4, title: 'stale' },
      ifMatch: '"2"',
    });
    expect(headerWins.status).toBe(412);

    const invalid = {
      error: 'bad_request',
      message: 'Invalid If-Match header',
    };
    for (const ifMatch of ['abc', '"1", "2"', '"-1"', '"1.5"']) {
      const res = await call('PUT', path, {
        body: { title: 'x' },
        ifMatch,
      });
      expect(res.status, ifMatch).toBe(400);
      expect(res.body, ifMatch).toEqual(invalid);
    }

    const missing = await call('PUT', path, { body: { title: 'No ver' } });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      error: 'bad_request',
      message: 'Expected version required (If-Match or body.version)',
    });

    const starMissing = await call('PUT', `/api/notebook/tasks/${TASK_2}`, {
      body: { title: 'nope' },
      ifMatch: '*',
    });
    expect(starMissing.status).toBe(404);
    expect(starMissing.body).toEqual({
      error: 'not_found',
      message: `task ${TASK_2} not found`,
    });

    const deleted = await call('DELETE', path, { ifMatch: '"4"' });
    expect(deleted.status).toBe(200);
    expect(deleted.etag).toBe('"5"');
    expect(deleted.body).toMatchObject({ deleted: true, version: 5 });
    expect((await call('GET', path)).status).toBe(404);

    // Writes to a tombstone answer the shape the iOS outbox restores from;
    // with If-Match the same tombstone comes back as a 412.
    const tombstone = expect.objectContaining({
      id: TASK_1,
      deleted: true,
      version: 5,
    });
    const deletedConflict = {
      error: 'deleted',
      message: `task ${TASK_1} was deleted`,
      currentVersion: 5,
      current: tombstone,
    };
    const put = await call('PUT', path, { body: { version: 4, title: 'x' } });
    expect(put.status).toBe(409);
    expect(put.body).toEqual(deletedConflict);
    const complete = await call('POST', `${path}/complete`, {
      body: { version: 4 },
    });
    expect(complete.status).toBe(409);
    expect(complete.body).toEqual(deletedConflict);
    const replayedDelete = await call('DELETE', path, {
      body: { version: 4 },
    });
    expect(replayedDelete.status).toBe(409);
    expect(replayedDelete.body).toEqual(deletedConflict);
    const starOnTombstone = await call('PUT', path, {
      body: { title: 'x' },
      ifMatch: '*',
    });
    expect(starOnTombstone.status).toBe(412);
    expect(starOnTombstone.body).toMatchObject({
      error: 'precondition_failed',
      current: tombstone,
    });
  });

  it('answers validation errors with field codes', async () => {
    const post = (body: Body) => call('POST', '/api/notebook/tasks', { body });
    expect(await post({ id: TASK_1, area: 'work', title: '' })).toMatchObject({
      status: 400,
      body: badBody({ title: 'too_small' }),
    });
    expect(
      await post({ id: TASK_1, area: 'garden', title: 'x' }),
    ).toMatchObject({ status: 400, body: badBody({ area: 'invalid_value' }) });
    expect(
      await post({ id: TASK_1, area: 'work', title: 'x', priority: 'urgent' }),
    ).toMatchObject({
      status: 400,
      body: badBody({ priority: 'invalid_value' }),
    });
    expect(
      await post({
        id: TASK_1,
        area: 'work',
        title: 'x',
        dueDate: '2026-13-01',
      }),
    ).toMatchObject({ status: 400, body: badBody({ dueDate: 'custom' }) });
    expect(await post({ area: 'work', title: 'x' })).toMatchObject({
      status: 400,
      body: badBody({ id: 'invalid_type' }),
    });

    const bigDescription = await post({
      id: TASK_1,
      area: 'work',
      title: 'x',
      description: 'd'.repeat(NOTEBOOK_TEXT_MAX_BYTES + 1),
    });
    expect(bigDescription.status).toBe(413);
    expect(bigDescription.body).toEqual({
      error: 'payload_too_large',
      message: `Text is over the ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB limit`,
      fields: { description: 'too_big' },
    });

    // Limits count code points: each emoji is two UTF-16 units.
    const emojiTitle = '😀'.repeat(300);
    const emojiTag = '😀'.repeat(50);
    expect(
      await createTask({ id: TASK_1, title: emojiTitle, tags: [emojiTag] }),
    ).toMatchObject({ title: emojiTitle, tags: [emojiTag] });
    expect(
      await post({ id: TASK_2, area: 'work', title: `${emojiTitle}x` }),
    ).toMatchObject({ status: 413, body: { fields: { title: 'too_big' } } });
    expect(
      await post({
        id: TASK_2,
        area: 'work',
        title: 'x',
        tags: [`${emojiTag}x`],
      }),
    ).toMatchObject({ status: 413, body: { fields: { 'tags.0': 'too_big' } } });

    const badJson = await h.api.request('POST', '/api/notebook/tasks', {
      body: '{not json',
      claims: notebookUser(USER_A),
    });
    expect(badJson.status).toBe(400);
    expect(badJson.body).toEqual({
      error: 'bad_request',
      message: 'Invalid JSON body',
    });

    const badId = await call('GET', '/api/notebook/tasks/not-a-ulid');
    expect(badId.status).toBe(400);
    expect(badId.body).toEqual({
      error: 'bad_request',
      message: 'Invalid path parameters',
      fields: { id: 'invalid_format' },
    });
  });
});

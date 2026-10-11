import { describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildDailyNoteClaimItem, keys } from '@gagnechris/data';
import { DEFAULT_DAILY_TEMPLATES, fillDailyTemplate } from '@gagnechris/shared';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-notes-parity';
const OTHER = 'user-notes-parity-other';
const PAGE_ID = '01ARZ3NDEKTSV4RRFFQ48JMCZC';
const PAGE_ID_2 = '01ARZ3NDEKTSV4RRFFQ48JMCZE';
const DAILY_ID = '01ARZ3NDEKTSV4RRFFQ48JMCZD';
const DAILY_ID_2 = '01ARZ3NDEKTSV4RRFFQ48JMCT0';
const D3 = '01ARZ3NDEKTSV4RRFFQ48JMD03';
const DAY = '2026-10-04';
const DAILY_PATH = `/api/notebook/notes/daily/work/${DAY}`;
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

type Body = Record<string, unknown>;

const h = useApi('notes-parity');

async function call(
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string>;
    ifMatch?: string;
    user?: string;
  } = {},
) {
  const res = await h.api.request(method, path, {
    body: opts.body,
    query: opts.query,
    headers: opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined,
    claims: notebookUser(opts.user ?? USER),
  });
  return {
    status: res.status,
    etag: res.headers.get('etag') ?? undefined,
    body: (res.body ?? {}) as Body,
  };
}

const createPage = (id: string, over: Body = {}, user = USER) =>
  call('POST', '/api/notebook/notes', {
    body: { id, area: 'work', type: 'page', ...over },
    user,
  });

const putDaily = (body: Body, ifMatch?: string) =>
  call('PUT', DAILY_PATH, { body, ifMatch });

const badBody = (fields: Record<string, string>) => ({
  error: 'bad_request',
  message: 'Invalid request body',
  fields,
});

async function readRow(key: { pk: string; sk: string }) {
  const out = await h.doc.send(
    new GetCommand({ TableName: h.tableName, Key: key, ConsistentRead: true }),
  );
  return out.Item;
}

describe('notes parity over HTTP (DynamoDB Local)', () => {
  it('creates, gets, updates with If-Match ETags, and lists by area and type', async () => {
    const created = await createPage(PAGE_ID, {
      title: 'Ideas',
      bodyMarkdown: 'hello',
    });
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"1"');
    expect(created.body).toEqual({
      id: PAGE_ID,
      userId: USER,
      area: 'work',
      type: 'page',
      date: null,
      title: 'Ideas',
      bodyMarkdown: 'hello',
      tags: [],
      pinned: false,
      taskIds: [],
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
      deleted: false,
    });
    const got = await call('GET', `/api/notebook/notes/${PAGE_ID}`);
    expect(got).toEqual({ status: 200, etag: '"1"', body: created.body });

    const conflict = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, title: 'stale' },
      ifMatch: '"0"',
    });
    expect(conflict.status).toBe(412);
    expect(conflict.body).toEqual({
      error: 'precondition_failed',
      message: 'Version conflict: expected 0, current 1',
      currentVersion: 1,
      current: created.body,
    });

    const updated = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, title: 'Updated' },
      ifMatch: '"1"',
    });
    expect(updated.status).toBe(200);
    expect(updated.etag).toBe('"2"');
    expect(updated.body).toEqual({
      ...created.body,
      title: 'Updated',
      version: 2,
      updatedAt: ISO,
    });

    const staleBody = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, title: 'stale' },
    });
    expect(staleBody.status).toBe(409);
    expect(staleBody.body).toEqual({
      error: 'version_conflict',
      message: 'Version conflict: expected 1, current 2',
      currentVersion: 2,
      current: updated.body,
    });

    expect((await createPage(PAGE_ID_2, { area: 'personal' })).status).toBe(
      201,
    );
    const listed = await call('GET', '/api/notebook/notes', {
      query: { area: 'work', type: 'page' },
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ items: [updated.body] });
  });

  it("batch returns the caller's live notes in order and validates the ids", async () => {
    await createPage(PAGE_ID, { title: 'Ideas' });
    await createPage(DAILY_ID, { title: 'Plans' });
    await createPage(DAILY_ID_2, { title: 'Other user' }, OTHER);
    expect(
      (
        await call('DELETE', `/api/notebook/notes/${DAILY_ID}`, {
          body: { version: 1 },
        })
      ).status,
    ).toBe(200);

    const batch = (ids: unknown) =>
      call('POST', '/api/notebook/notes/batch', { body: { ids } });
    const res = await batch([DAILY_ID_2, DAILY_ID, PAGE_ID]);
    expect(res.status).toBe(200);
    expect((res.body.items as Body[]).map((n) => n.title)).toEqual(['Ideas']);
    expect(await batch([])).toMatchObject({
      status: 400,
      body: badBody({ ids: 'too_small' }),
    });
    expect(
      await batch(Array.from({ length: 101 }, () => PAGE_ID)),
    ).toMatchObject({ status: 400, body: badBody({ ids: 'too_big' }) });
    expect(await batch(['nope'])).toMatchObject({
      status: 400,
      body: badBody({ 'ids.0': 'invalid_format' }),
    });
  });

  it('derives taskIds from the body on every save and ignores client values', async () => {
    const TASK_A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
    const TASK_B = '01JBBBBBBBBBBBBBBBBBBBBBBB';
    const created = await call('POST', '/api/notebook/notes', {
      body: {
        id: PAGE_ID,
        area: 'work',
        type: 'page',
        bodyMarkdown: `{{task:${TASK_A}}}\ntext\n{{task:${TASK_A}}}`,
        taskIds: [TASK_B],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.taskIds).toEqual([TASK_A]);

    const titleOnly = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, title: 'Renamed', taskIds: [] },
    });
    expect(titleOnly.status).toBe(200);
    expect(titleOnly.body.taskIds).toEqual([TASK_A]);

    const updated = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: {
        version: 2,
        bodyMarkdown: `  {{task:${TASK_B}}}\n\`\`\`\n{{task:${TASK_A}}}\n\`\`\``,
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.taskIds).toEqual([TASK_B]);
    expect(await readRow(keys.notebook.note.meta(USER, PAGE_ID))).toMatchObject(
      { taskIds: [TASK_B] },
    );

    const daily = await call('PUT', DAILY_PATH, {
      body: {
        id: DAILY_ID,
        bodyMarkdown: `{{task:${TASK_B}}}\n{{task:${TASK_A}}}`,
        taskIds: [],
      },
    });
    expect(daily.status).toBe(200);
    expect(daily.body.taskIds).toEqual([TASK_B, TASK_A]);
  });

  it('daily GET returns an empty draft from the default template; PUT creates; POST loser gets daily_taken', async () => {
    const empty = await call(
      'GET',
      '/api/notebook/notes/daily/work/2026-10-02',
    );
    expect(empty.status).toBe(200);
    expect(empty.etag).toBeUndefined();
    expect(empty.body).toEqual({
      exists: false,
      userId: USER,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: '',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
      version: 0,
      templateMarkdown: fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        area: 'work',
        date: '2026-10-02',
      }),
    });

    const upsert = await call(
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-02',
      { body: { id: DAILY_ID, title: 'Today', bodyMarkdown: '- [ ] ship' } },
    );
    expect(upsert.status).toBe(200);
    expect(upsert.etag).toBe('"1"');
    expect(upsert.body).toEqual({
      id: DAILY_ID,
      userId: USER,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: 'Today',
      bodyMarkdown: '- [ ] ship',
      tags: [],
      pinned: false,
      taskIds: [],
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
      deleted: false,
    });
    const read = await call('GET', '/api/notebook/notes/daily/work/2026-10-02');
    expect(read).toEqual({ status: 200, etag: '"1"', body: upsert.body });

    const loser = await call('POST', '/api/notebook/notes', {
      body: {
        id: DAILY_ID_2,
        area: 'work',
        type: 'daily',
        date: '2026-10-02',
        title: 'Other device',
      },
    });
    expect(loser.status).toBe(409);
    expect(loser.body).toEqual({
      error: 'daily_taken',
      message: 'Daily note already exists for this area and date',
      currentVersion: 1,
      current: upsert.body,
    });
  });

  it('a soft delete answers the tombstone and the sync feed carries it', async () => {
    await createPage(PAGE_ID, { area: 'personal', title: 'Private' });
    expect(
      (await call('GET', `/api/notebook/notes/${PAGE_ID}`, { user: OTHER }))
        .status,
    ).toBe(404);

    const deleted = await call('DELETE', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1 },
      ifMatch: '"1"',
    });
    expect(deleted.status).toBe(200);
    expect(deleted.etag).toBe('"2"');
    expect(deleted.body).toMatchObject({
      id: PAGE_ID,
      deleted: true,
      version: 2,
    });

    // Writes to a tombstone answer the shape the iOS outbox restores from.
    const deletedConflict = {
      error: 'deleted',
      message: `note ${PAGE_ID} was deleted`,
      currentVersion: 2,
      current: expect.objectContaining({ id: PAGE_ID, deleted: true }),
    };
    const put = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, title: 'Edited offline' },
    });
    expect(put.status).toBe(409);
    expect(put.body).toEqual(deletedConflict);
    const replayedDelete = await call(
      'DELETE',
      `/api/notebook/notes/${PAGE_ID}`,
      {
        body: { version: 1 },
      },
    );
    expect(replayedDelete.status).toBe(409);
    expect(replayedDelete.body).toEqual(deletedConflict);

    const sync = await call('GET', '/api/notebook/sync/changes');
    expect(sync.status).toBe(200);
    expect(sync.body.changes).toEqual([
      {
        type: 'note',
        id: PAGE_ID,
        version: 2,
        deleted: true,
        updatedAt: ISO,
      },
    ]);

    const row = await readRow(keys.notebook.note.meta(USER, PAGE_ID));
    expect(row).toMatchObject({ deleted: true });
    for (const attr of ['gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk']) {
      expect(row).not.toHaveProperty(attr);
    }
    expect(
      (
        await call('GET', '/api/notebook/notes', {
          query: { area: 'personal' },
        })
      ).body,
    ).toEqual({ items: [] });
  });

  it('If-Match on notes: *, weak, comma list, malformed, and * on a missing note', async () => {
    await createPage(PAGE_ID, { title: 'A' });
    const path = `/api/notebook/notes/${PAGE_ID}`;

    const star = await call('PUT', path, {
      body: { title: 'star' },
      ifMatch: '*',
    });
    expect(star.status).toBe(200);
    expect(star.etag).toBe('"2"');
    expect(star.body).toMatchObject({ title: 'star', version: 2 });

    await call('PUT', path, { body: { title: 'C' }, ifMatch: 'W/"2"' });
    await call('PUT', path, { body: { title: 'D' }, ifMatch: '"3"' });
    const staleWeak = await call('PUT', path, {
      body: { title: 'stale' },
      ifMatch: 'W/"3"',
    });
    expect(staleWeak.status).toBe(412);
    expect(staleWeak.body).toMatchObject({
      error: 'precondition_failed',
      message: 'Version conflict: expected 3, current 4',
      currentVersion: 4,
      current: { id: PAGE_ID, title: 'D', version: 4 },
    });

    for (const ifMatch of ['abc', '"3", "4"', 'W/"x"']) {
      const res = await call('PUT', path, { body: { title: 'x' }, ifMatch });
      expect(res.status, ifMatch).toBe(400);
      expect(res.body, ifMatch).toEqual({
        error: 'bad_request',
        message: 'Invalid If-Match header',
      });
    }

    const missing = await call('PUT', `/api/notebook/notes/${PAGE_ID_2}`, {
      body: { title: 'nope' },
      ifMatch: '*',
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: 'not_found',
      message: `note ${PAGE_ID_2} not found`,
    });

    const del = await call('DELETE', path, { ifMatch: '*' });
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ deleted: true, version: 5 });
  });

  it('answers note validation errors with field codes and 413 for oversized fields', async () => {
    const post = (body: Body) => call('POST', '/api/notebook/notes', { body });
    expect(
      await post({ id: DAILY_ID, area: 'work', type: 'daily' }),
    ).toMatchObject({ status: 400, body: badBody({ date: 'custom' }) });
    expect(
      await post({ id: PAGE_ID, area: 'work', type: 'page', date: DAY }),
    ).toMatchObject({ status: 400, body: badBody({ date: 'custom' }) });
    expect(
      await post({ id: PAGE_ID, area: 'work', type: 'journal' }),
    ).toMatchObject({ status: 400, body: badBody({ type: 'invalid_value' }) });
    expect(
      await post({ id: PAGE_ID, area: 'work', type: 'page', pinned: 'yes' }),
    ).toMatchObject({ status: 400, body: badBody({ pinned: 'invalid_type' }) });

    const longTitle = await post({
      id: PAGE_ID,
      area: 'work',
      type: 'page',
      title: 't'.repeat(301),
    });
    expect(longTitle.status).toBe(413);
    expect(longTitle.body).toEqual({
      error: 'payload_too_large',
      message: 'Too big: expected string to have <=300 characters',
      fields: { title: 'too_big' },
    });

    const badDate = await call(
      'GET',
      '/api/notebook/notes/daily/work/2026-02-30',
    );
    expect(badDate.status).toBe(400);
    expect(badDate.body).toEqual({
      error: 'bad_request',
      message: 'Invalid path parameters',
      fields: { date: 'custom' },
    });
  });
});

describe('daily note claims over HTTP (DynamoDB Local)', () => {
  const claimKey = keys.notebook.dailyClaim(USER, 'work', DAY);

  it('deleting a daily note releases its claim and frees the day', async () => {
    const created = await putDaily({ id: DAILY_ID, bodyMarkdown: 'first' });
    expect(created.status).toBe(200);
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_ID });

    const deleted = await call('DELETE', `/api/notebook/notes/${DAILY_ID}`, {
      body: { version: 1 },
    });
    expect(deleted.status).toBe(200);
    expect(await readRow(claimKey)).toBeUndefined();
    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
      version: 0,
    });

    const again = await putDaily({ id: DAILY_ID_2, bodyMarkdown: 'second' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      id: DAILY_ID_2,
      bodyMarkdown: 'second',
      version: 1,
    });
    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      id: DAILY_ID_2,
    });
  });

  it('a claim still pointing at a tombstone reads and writes as free', async () => {
    await putDaily({ id: DAILY_ID, bodyMarkdown: 'old' });
    await call('DELETE', `/api/notebook/notes/${DAILY_ID}`, {
      body: { version: 1 },
    });
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: buildDailyNoteClaimItem(USER, 'work', DAY, DAILY_ID),
      }),
    );

    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await putDaily({ id: DAILY_ID_2, bodyMarkdown: 'new' });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({
      id: DAILY_ID_2,
      deleted: false,
      version: 1,
    });
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_ID_2 });
  });

  it('a claim whose holder row is gone does not block the day, on PUT or POST', async () => {
    await putDaily({ id: DAILY_ID, bodyMarkdown: 'old' });
    await h.doc.send(
      new DeleteCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(USER, DAILY_ID),
      }),
    );

    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await putDaily({ id: DAILY_ID_2, bodyMarkdown: 'new' });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({ id: DAILY_ID_2, bodyMarkdown: 'new' });
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_ID_2 });

    const OTHER_DAY = '2026-10-05';
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: buildDailyNoteClaimItem(USER, 'work', OTHER_DAY, PAGE_ID),
      }),
    );
    const viaPost = await call('POST', '/api/notebook/notes', {
      body: {
        id: D3,
        area: 'work',
        type: 'daily',
        date: OTHER_DAY,
        bodyMarkdown: 'post',
      },
    });
    expect(viaPost.status).toBe(201);
    expect(viaPost.body).toMatchObject({ id: D3, date: OTHER_DAY });
    expect(
      await readRow(keys.notebook.dailyClaim(USER, 'work', OTHER_DAY)),
    ).toMatchObject({ noteId: D3 });
  });

  it("a daily note's area cannot change; a page's can", async () => {
    await putDaily({ id: DAILY_ID });
    const moved = await call('PUT', `/api/notebook/notes/${DAILY_ID}`, {
      body: { version: 1, area: 'personal' },
    });
    expect(moved.status).toBe(400);
    expect(moved.body).toEqual({
      error: 'bad_request',
      message: "A daily note's area cannot change",
      fields: { area: 'immutable' },
    });
    const sameArea = await call('PUT', `/api/notebook/notes/${DAILY_ID}`, {
      body: { version: 1, area: 'work', title: 'Same area' },
    });
    expect(sameArea.status).toBe(200);

    await createPage(PAGE_ID);
    const pageMoved = await call('PUT', `/api/notebook/notes/${PAGE_ID}`, {
      body: { version: 1, area: 'personal' },
    });
    expect(pageMoved.status).toBe(200);
    expect(pageMoved.body).toMatchObject({ area: 'personal', version: 2 });
  });

  it('a placeholder writer that lost the race gets 409 with the winner; a lost-response retry is a no-op', async () => {
    const winner = await putDaily({ id: DAILY_ID, bodyMarkdown: 'tab A' });
    expect(winner.status).toBe(200);

    const tabB = await putDaily({ id: DAILY_ID_2, bodyMarkdown: 'tab B' });
    expect(tabB.status).toBe(409);
    expect(tabB.body).toEqual({
      error: 'daily_taken',
      message: 'Daily note already exists for this area and date',
      currentVersion: 1,
      current: winner.body,
    });

    const retry = await putDaily({ id: DAILY_ID, bodyMarkdown: 'tab A' });
    expect(retry.status).toBe(200);
    expect(retry.etag).toBe('"1"');
    expect(retry.body).toEqual(winner.body);

    const changed = await putDaily({
      id: DAILY_ID,
      bodyMarkdown: 'tab A edited elsewhere',
    });
    expect(changed.status).toBe(409);
    expect(changed.body).toEqual({
      error: 'version_conflict',
      message: 'Daily note changed since it was created',
      currentVersion: 1,
      current: winner.body,
    });

    const loser = await call('POST', '/api/notebook/notes', {
      body: {
        id: D3,
        area: 'work',
        type: 'daily',
        date: DAY,
        bodyMarkdown: 'loser',
      },
    });
    expect(loser.status).toBe(409);
    expect(loser.body).toMatchObject({
      error: 'daily_taken',
      currentVersion: 1,
      current: { id: DAILY_ID, bodyMarkdown: 'tab A' },
    });
  });

  it("versioned daily PUTs update the day's note, whatever id they carry", async () => {
    await putDaily({ id: DAILY_ID, bodyMarkdown: 'v1' });
    const v2 = await putDaily({ id: DAILY_ID, version: 1, bodyMarkdown: 'v2' });
    expect(v2.status).toBe(200);
    expect(v2.etag).toBe('"2"');
    expect(v2.body).toMatchObject({ version: 2, bodyMarkdown: 'v2' });

    const viaIfMatch = await putDaily(
      { id: DAILY_ID, bodyMarkdown: 'v3' },
      '"2"',
    );
    expect(viaIfMatch.status).toBe(200);
    expect(viaIfMatch.body).toMatchObject({ version: 3, bodyMarkdown: 'v3' });

    const merged = await putDaily({
      id: DAILY_ID_2,
      version: 3,
      bodyMarkdown: 'merged',
    });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({
      id: DAILY_ID,
      version: 4,
      bodyMarkdown: 'merged',
    });

    const stale = await putDaily({
      id: DAILY_ID,
      version: 1,
      bodyMarkdown: 'old',
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      error: 'version_conflict',
      message: 'Version conflict: expected 1, current 4',
      currentVersion: 4,
      current: merged.body,
    });

    const staleHeader = await putDaily(
      { id: DAILY_ID, bodyMarkdown: 'old' },
      '"1"',
    );
    expect(staleHeader.status).toBe(412);
    expect(staleHeader.body).toMatchObject({
      error: 'precondition_failed',
      currentVersion: 4,
      current: merged.body,
    });
  });
});

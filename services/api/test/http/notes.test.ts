import { describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildDailyNoteClaimItem, keys } from '@gagnechris/data';
import {
  DEFAULT_DAILY_TEMPLATES,
  NOTEBOOK_BATCH_MAX_IDS,
  NOTEBOOK_TAG_MAX_LENGTH,
  NOTEBOOK_TITLE_MAX_LENGTH,
  fillDailyTemplate,
} from '@gagnechris/shared';
import { notebookUser } from './support/claims.js';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-a-notes';
const USER_B = 'user-b-notes';
const PAGE_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DAILY_1 = '01ARZ3NDEKTSV4RRFFQ69G5FC0';
const DAILY_2 = '01ARZ3NDEKTSV4RRFFQ69G5FC1';
const DAILY_3 = '01ARZ3NDEKTSV4RRFFQ69G5FC2';
const PAGE_B = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const DAY = '2026-10-04';
const DAILY_PATH = `/api/notebook/notes/daily/work/${DAY}`;
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

type Body = Record<string, unknown>;

const h = useApi('notes-api');
const { call } = apiCalls(h, { user: USER_A });

const createNote = (user: string, note: Body) =>
  call('POST', '/api/notebook/notes', {
    user,
    body: {
      area: 'work',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
      ...note,
    },
  });

const page = (id: string, title: string, over: Body = {}) => ({
  id,
  type: 'page',
  title,
  ...over,
});

const daily = (id: string, title: string, date: string, over: Body = {}) => ({
  id,
  type: 'daily',
  date,
  title,
  ...over,
});

function splitRace(results: { status: number; body: Body }[]) {
  const won = results.filter((r) => r.status === 201);
  const lost = results.filter((r) => r.status !== 201);
  return { won, lost };
}

const createPage = (id: string, over: Body = {}, user = USER_A) =>
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

describe('notes over HTTP (DynamoDB Local)', () => {
  it('stores taskIds derived from the body and derives them for older rows', async () => {
    const TASK = '01ARZ3NDEKTSV4RRFFQ69G5T01';
    const created = await createNote(
      USER_A,
      page(PAGE_A, 'Embeds', { bodyMarkdown: `intro\n{{task:${TASK}}}` }),
    );
    expect(created.status).toBe(201);
    const key = keys.notebook.note.meta(USER_A, PAGE_A);
    const stored = await h.doc.send(
      new GetCommand({ TableName: h.tableName, Key: key }),
    );
    expect(stored.Item?.taskIds).toEqual([TASK]);

    const updated = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: {
        version: 1,
        bodyMarkdown: 'no embeds',
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.taskIds).toEqual([]);

    const { taskIds: _drop, ...legacy } = stored.Item!;
    await h.doc.send(new PutCommand({ TableName: h.tableName, Item: legacy }));
    const got = await call('GET', `/api/notebook/notes/${PAGE_A}`, {});
    expect(got.status).toBe(200);
    expect(got.body.taskIds).toEqual([TASK]);
  });

  it('isolates owners, enforces daily claim, and feeds typed note changes', async () => {
    const created = await createNote(
      USER_A,
      page(PAGE_A, 'A page', { bodyMarkdown: 'body', tags: ['x'] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);

    expect(
      (await call('GET', `/api/notebook/notes/${PAGE_A}`, { user: USER_B }))
        .status,
    ).toBe(404);

    const dailyA = await createNote(
      USER_A,
      daily(DAILY_1, 'First', '2026-10-02'),
    );
    expect(dailyA.status).toBe(201);
    const second = await createNote(
      USER_A,
      daily(DAILY_2, 'Second', '2026-10-02'),
    );
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: 'daily_taken',
      current: { id: dailyA.body.id, title: 'First' },
    });

    const listed = await h.api.request('GET', '/api/notebook/notes', {
      claims: notebookUser(USER_A),
      query: { area: 'work', from: '2026-10-01', to: '2026-10-03' },
    });
    expect(listed.status).toBe(200);
    const items = listed.body.items as Body[];
    expect(items.map((n) => n.id)).toContain(dailyA.body.id);
    expect(items.every((n) => n.type === 'daily')).toBe(true);

    const edited = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: {
        version: 1,
        title: 'Edited',
      },
    });
    expect(edited.status).toBe(200);

    const feed = await call('GET', '/api/notebook/sync/changes', {});
    expect(feed.status).toBe(200);
    const changes = feed.body.changes as Body[];
    expect(changes.some((c) => c.type === 'note')).toBe(true);
    expect(changes.map((c) => c.id).sort()).toEqual(
      [PAGE_A, dailyA.body.id].sort(),
    );
  });

  it('delete frees the daily slot; 10 concurrent creates give 1 winner and 9 daily_taken', async () => {
    const first = await createNote(
      USER_A,
      daily(DAILY_1, 'First', '2026-10-05'),
    );
    expect(first.status).toBe(201);
    expect(
      (
        await call('DELETE', `/api/notebook/notes/${DAILY_1}`, {
          body: {
            version: first.body.version,
          },
        })
      ).status,
    ).toBe(200);
    const empty = await call(
      'GET',
      '/api/notebook/notes/daily/work/2026-10-05',
    );
    expect(empty.body).toMatchObject({ exists: false });

    const recreated = await createNote(
      USER_A,
      daily(DAILY_2, 'Recreated', '2026-10-05'),
    );
    expect(recreated.status).toBe(201);
    expect(recreated.body.id).toBe(DAILY_2);
    expect(
      (await call('GET', '/api/notebook/notes/daily/work/2026-10-05', {})).body,
    ).toMatchObject({ id: DAILY_2 });

    const ids = Array.from(
      { length: 10 },
      (_, i) => `01ARZ3NDEKTSV4RRFFQ69G5FD${i}`,
    );
    const results = await Promise.all(
      ids.map((id) =>
        createNote(USER_A, daily(id, id, '2026-10-06', { area: 'personal' })),
      ),
    );
    const { won, lost } = splitRace(results);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    const winnerId = won[0]!.body.id;
    for (const r of lost) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({
        error: 'daily_taken',
        current: { id: winnerId },
      });
    }
  });

  it('delete releases the claim row; an orphaned claim gives the day to exactly one of 10 racers', async () => {
    const DAY = '2026-10-07';
    const claimKey = keys.notebook.dailyClaim(USER_A, 'work', DAY);
    const readClaim = async () =>
      (
        await h.doc.send(
          new GetCommand({
            TableName: h.tableName,
            Key: claimKey,
            ConsistentRead: true,
          }),
        )
      ).Item;
    const create = (id: string) => createNote(USER_A, daily(id, id, DAY));

    const first = await create(DAILY_1);
    expect(first.status).toBe(201);
    expect(await readClaim()).toMatchObject({ noteId: DAILY_1 });
    expect(
      (
        await call('DELETE', `/api/notebook/notes/${DAILY_1}`, {
          body: {
            version: first.body.version,
          },
        })
      ).status,
    ).toBe(200);
    expect(await readClaim()).toBeUndefined();

    // A claim left behind whose tombstone has since been purged.
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: buildDailyNoteClaimItem(USER_A, 'work', DAY, DAILY_1),
      }),
    );
    await h.doc.send(
      new DeleteCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(USER_A, DAILY_1),
      }),
    );

    const ids = Array.from(
      { length: 10 },
      (_, i) => `01ARZ3NDEKTSV4RRFFQ69G5FE${i}`,
    );
    const results = await Promise.all(ids.map((id) => create(id)));
    const { won, lost } = splitRace(results);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    const winnerId = won[0]!.body.id;
    for (const r of lost) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({
        error: 'daily_taken',
        current: { id: winnerId },
      });
    }
    expect(await readClaim()).toMatchObject({ noteId: winnerId });
  });

  it('10 parallel versionless daily PUTs give exactly one 200 and nine daily_taken with the winner', async () => {
    for (let run = 0; run < 50; run += 1) {
      const day = new Date(Date.UTC(2027, 0, 1 + run))
        .toISOString()
        .slice(0, 10);
      const path = `/api/notebook/notes/daily/work/${day}`;
      const ids = Array.from(
        { length: 10 },
        (_, i) => `01ARZ3NDEKTSV4RRFF${String(run).padStart(2, '0')}${i}00000`,
      );
      const results = await Promise.all(
        ids.map((id) =>
          call('PUT', path, {
            body: {
              id,
              title: id,
              bodyMarkdown: `body ${id}`,
            },
          }),
        ),
      );

      const won = results.filter((r) => r.status === 200);
      const lost = results.filter((r) => r.status === 409);
      expect(won, `run ${run}`).toHaveLength(1);
      expect(lost, `run ${run}`).toHaveLength(9);
      const winner = won[0]!.body;
      expect(winner).toMatchObject({
        version: 1,
        bodyMarkdown: `body ${winner.id}`,
      });
      for (const r of lost) {
        expect(r.body).toMatchObject({
          error: 'daily_taken',
          current: { id: winner.id, version: 1, title: winner.id },
        });
      }
    }
  });
  it('creates, gets, updates with If-Match ETags, and lists by area and type', async () => {
    const created = await createPage(PAGE_A, {
      title: 'Ideas',
      bodyMarkdown: 'hello',
    });
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"1"');
    expect(created.body).toEqual({
      id: PAGE_A,
      userId: USER_A,
      area: 'work',
      type: 'page',
      date: null,
      title: 'Ideas',
      bodyMarkdown: 'hello',
      tags: [],
      pinned: false,
      archived: false,
      taskIds: [],
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
      deleted: false,
    });
    const got = await call('GET', `/api/notebook/notes/${PAGE_A}`);
    expect(got).toEqual({ status: 200, etag: '"1"', body: created.body });

    const conflict = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
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

    const updated = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
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

    const staleBody = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1, title: 'stale' },
    });
    expect(staleBody.status).toBe(409);
    expect(staleBody.body).toEqual({
      error: 'version_conflict',
      message: 'Version conflict: expected 1, current 2',
      currentVersion: 2,
      current: updated.body,
    });

    expect((await createPage(PAGE_B, { area: 'personal' })).status).toBe(201);
    const listed = await call('GET', '/api/notebook/notes', {
      query: { area: 'work', type: 'page' },
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ items: [updated.body] });
  });

  it("batch returns the caller's live notes in order and validates the ids", async () => {
    await createPage(PAGE_A, { title: 'Ideas' });
    await createPage(DAILY_1, { title: 'Plans' });
    await createPage(DAILY_2, { title: 'Other user' }, USER_B);
    expect(
      (
        await call('DELETE', `/api/notebook/notes/${DAILY_1}`, {
          body: { version: 1 },
        })
      ).status,
    ).toBe(200);

    const batch = (ids: unknown) =>
      call('POST', '/api/notebook/notes/batch', { body: { ids } });
    const res = await batch([
      DAILY_2,
      '01ARZ3NDEKTSV4RRFFQ69G5FC9',
      DAILY_1,
      PAGE_A,
    ]);
    expect(res.status).toBe(200);
    expect((res.body.items as Body[]).map((n) => n.title)).toEqual(['Ideas']);
    expect(await batch([])).toMatchObject({
      status: 400,
      body: badBody({ ids: 'too_small' }),
    });
    expect(
      await batch(
        Array.from({ length: NOTEBOOK_BATCH_MAX_IDS + 1 }, () => PAGE_A),
      ),
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
        id: PAGE_A,
        area: 'work',
        type: 'page',
        bodyMarkdown: `{{task:${TASK_A}}}\ntext\n{{task:${TASK_A}}}`,
        taskIds: [TASK_B],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.taskIds).toEqual([TASK_A]);

    const titleOnly = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1, title: 'Renamed', taskIds: [] },
    });
    expect(titleOnly.status).toBe(200);
    expect(titleOnly.body.taskIds).toEqual([TASK_A]);

    const updated = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: {
        version: 2,
        bodyMarkdown: `  {{task:${TASK_B}}}\n\`\`\`\n{{task:${TASK_A}}}\n\`\`\``,
      },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.taskIds).toEqual([TASK_B]);
    expect(
      await readRow(keys.notebook.note.meta(USER_A, PAGE_A)),
    ).toMatchObject({ taskIds: [TASK_B] });

    const daily = await call('PUT', DAILY_PATH, {
      body: {
        id: DAILY_1,
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
      userId: USER_A,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: '',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
      version: 0,
      templateMarkdown: fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        areaName: 'Work',
        date: '2026-10-02',
      }),
    });

    const upsert = await call(
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-02',
      { body: { id: DAILY_1, title: 'Today', bodyMarkdown: '- [ ] ship' } },
    );
    expect(upsert.status).toBe(200);
    expect(upsert.etag).toBe('"1"');
    expect(upsert.body).toEqual({
      id: DAILY_1,
      userId: USER_A,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: 'Today',
      bodyMarkdown: '- [ ] ship',
      tags: [],
      pinned: false,
      archived: false,
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
        id: DAILY_2,
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
    await createPage(PAGE_A, { area: 'personal', title: 'Private' });
    expect(
      (await call('GET', `/api/notebook/notes/${PAGE_A}`, { user: USER_B }))
        .status,
    ).toBe(404);

    const deleted = await call('DELETE', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1 },
      ifMatch: '"1"',
    });
    expect(deleted.status).toBe(200);
    expect(deleted.etag).toBe('"2"');
    expect(deleted.body).toMatchObject({
      id: PAGE_A,
      deleted: true,
      version: 2,
    });

    // Writes to a tombstone answer the shape the iOS outbox restores from.
    const deletedConflict = {
      error: 'deleted',
      message: `note ${PAGE_A} was deleted`,
      currentVersion: 2,
      current: expect.objectContaining({ id: PAGE_A, deleted: true }),
    };
    const put = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1, title: 'Edited offline' },
    });
    expect(put.status).toBe(409);
    expect(put.body).toEqual(deletedConflict);
    const replayedDelete = await call(
      'DELETE',
      `/api/notebook/notes/${PAGE_A}`,
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
        id: PAGE_A,
        version: 2,
        deleted: true,
        updatedAt: ISO,
      },
    ]);

    const row = await readRow(keys.notebook.note.meta(USER_A, PAGE_A));
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
    await createPage(PAGE_A, { title: 'A' });
    const path = `/api/notebook/notes/${PAGE_A}`;

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
      current: { id: PAGE_A, title: 'D', version: 4 },
    });

    for (const ifMatch of ['abc', '"3", "4"', 'W/"x"']) {
      const res = await call('PUT', path, { body: { title: 'x' }, ifMatch });
      expect(res.status, ifMatch).toBe(400);
      expect(res.body, ifMatch).toEqual({
        error: 'bad_request',
        message: 'Invalid If-Match header',
      });
    }

    const missing = await call('PUT', `/api/notebook/notes/${PAGE_B}`, {
      body: { title: 'nope' },
      ifMatch: '*',
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: 'not_found',
      message: `note ${PAGE_B} not found`,
    });

    const del = await call('DELETE', path, { ifMatch: '*' });
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ deleted: true, version: 5 });
  });

  it('answers note validation errors with field codes and 413 for oversized fields', async () => {
    const post = (body: Body) => call('POST', '/api/notebook/notes', { body });
    expect(
      await post({ id: DAILY_1, area: 'work', type: 'daily' }),
    ).toMatchObject({ status: 400, body: badBody({ date: 'custom' }) });
    expect(
      await post({ id: PAGE_A, area: 'work', type: 'page', date: DAY }),
    ).toMatchObject({ status: 400, body: badBody({ date: 'custom' }) });
    expect(
      await post({ id: PAGE_A, area: 'work', type: 'journal' }),
    ).toMatchObject({ status: 400, body: badBody({ type: 'invalid_value' }) });
    expect(
      await post({ id: PAGE_A, area: 'work', type: 'page', pinned: 'yes' }),
    ).toMatchObject({ status: 400, body: badBody({ pinned: 'invalid_type' }) });

    const longTitle = await post({
      id: PAGE_A,
      area: 'work',
      type: 'page',
      title: 't'.repeat(NOTEBOOK_TITLE_MAX_LENGTH + 1),
    });
    expect(longTitle.status).toBe(413);
    expect(longTitle.body).toEqual({
      error: 'payload_too_large',
      message: `Too big: expected string to have <=${NOTEBOOK_TITLE_MAX_LENGTH} characters`,
      fields: { title: 'too_big' },
    });

    const emojiTitle = '😀'.repeat(NOTEBOOK_TITLE_MAX_LENGTH);
    const emojiTag = '😀'.repeat(NOTEBOOK_TAG_MAX_LENGTH);
    expect(
      await post({
        id: PAGE_A,
        area: 'work',
        type: 'page',
        title: emojiTitle,
        tags: [emojiTag],
      }),
    ).toMatchObject({
      status: 201,
      body: { title: emojiTitle, tags: [emojiTag] },
    });
    expect(
      await post({
        id: PAGE_B,
        area: 'work',
        type: 'page',
        title: `${emojiTitle}x`,
      }),
    ).toMatchObject({ status: 413, body: { fields: { title: 'too_big' } } });

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
  const claimKey = keys.notebook.dailyClaim(USER_A, 'work', DAY);

  it('deleting a daily note releases its claim and frees the day', async () => {
    const created = await putDaily({ id: DAILY_1, bodyMarkdown: 'first' });
    expect(created.status).toBe(200);
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_1 });

    const deleted = await call('DELETE', `/api/notebook/notes/${DAILY_1}`, {
      body: { version: 1 },
    });
    expect(deleted.status).toBe(200);
    expect(await readRow(claimKey)).toBeUndefined();
    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
      version: 0,
    });

    const again = await putDaily({ id: DAILY_2, bodyMarkdown: 'second' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      id: DAILY_2,
      bodyMarkdown: 'second',
      version: 1,
    });
    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      id: DAILY_2,
    });
  });

  it('a claim still pointing at a tombstone reads and writes as free', async () => {
    await putDaily({ id: DAILY_1, bodyMarkdown: 'old' });
    await call('DELETE', `/api/notebook/notes/${DAILY_1}`, {
      body: { version: 1 },
    });
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: buildDailyNoteClaimItem(USER_A, 'work', DAY, DAILY_1),
      }),
    );

    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await putDaily({ id: DAILY_2, bodyMarkdown: 'new' });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({
      id: DAILY_2,
      deleted: false,
      version: 1,
    });
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_2 });
  });

  it('a claim whose holder row is gone does not block the day, on PUT or POST', async () => {
    await putDaily({ id: DAILY_1, bodyMarkdown: 'old' });
    await h.doc.send(
      new DeleteCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(USER_A, DAILY_1),
      }),
    );

    expect((await call('GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await putDaily({ id: DAILY_2, bodyMarkdown: 'new' });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({ id: DAILY_2, bodyMarkdown: 'new' });
    expect(await readRow(claimKey)).toMatchObject({ noteId: DAILY_2 });

    const OTHER_DAY = '2026-10-05';
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: buildDailyNoteClaimItem(USER_A, 'work', OTHER_DAY, PAGE_A),
      }),
    );
    const viaPost = await call('POST', '/api/notebook/notes', {
      body: {
        id: DAILY_3,
        area: 'work',
        type: 'daily',
        date: OTHER_DAY,
        bodyMarkdown: 'post',
      },
    });
    expect(viaPost.status).toBe(201);
    expect(viaPost.body).toMatchObject({ id: DAILY_3, date: OTHER_DAY });
    expect(
      await readRow(keys.notebook.dailyClaim(USER_A, 'work', OTHER_DAY)),
    ).toMatchObject({ noteId: DAILY_3 });
  });

  it("a daily note's area cannot change; a page's can", async () => {
    await putDaily({ id: DAILY_1 });
    const moved = await call('PUT', `/api/notebook/notes/${DAILY_1}`, {
      body: { version: 1, area: 'personal' },
    });
    expect(moved.status).toBe(400);
    expect(moved.body).toEqual({
      error: 'bad_request',
      message: "A daily note's area cannot change",
      fields: { area: 'immutable' },
    });
    const sameArea = await call('PUT', `/api/notebook/notes/${DAILY_1}`, {
      body: { version: 1, area: 'work', title: 'Same area' },
    });
    expect(sameArea.status).toBe(200);

    await createPage(PAGE_A);
    const pageMoved = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1, area: 'personal' },
    });
    expect(pageMoved.status).toBe(200);
    expect(pageMoved.body).toMatchObject({ area: 'personal', version: 2 });
  });

  it('archives and unarchives a page; a daily note cannot be archived; older rows read as not archived', async () => {
    const created = await createPage(PAGE_A, { title: 'Standing' });
    expect(created.status).toBe(201);
    expect(created.body.archived).toBe(false);

    const key = keys.notebook.note.meta(USER_A, PAGE_A);
    const { archived: _drop, ...legacy } = (await readRow(key))!;
    await h.doc.send(new PutCommand({ TableName: h.tableName, Item: legacy }));
    const old = await call('GET', `/api/notebook/notes/${PAGE_A}`, {});
    expect(old.body).toMatchObject({ archived: false, version: 1 });

    const archived = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 1, archived: true },
    });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ archived: true, version: 2 });
    expect(await readRow(key)).toMatchObject({ archived: true });

    const edited = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 2, bodyMarkdown: 'still editable' },
    });
    expect(edited.body).toMatchObject({ archived: true, version: 3 });

    const pages = await call('GET', '/api/notebook/notes?type=page', {});
    expect(pages.body.items).toEqual([
      expect.objectContaining({ id: PAGE_A, archived: true }),
    ]);

    const restored = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 3, archived: false },
    });
    expect(restored.body).toMatchObject({ archived: false, version: 4 });

    await putDaily({ id: DAILY_1 });
    const dailyArchived = await call('PUT', `/api/notebook/notes/${DAILY_1}`, {
      body: { version: 1, archived: true },
    });
    expect(dailyArchived.status).toBe(400);
    expect(dailyArchived.body).toEqual({
      error: 'bad_request',
      message: 'Only page notes can be archived',
      fields: { archived: 'page_only' },
    });

    const notBool = await call('PUT', `/api/notebook/notes/${PAGE_A}`, {
      body: { version: 4, archived: 'yes' },
    });
    expect(notBool.status).toBe(400);
    expect(notBool.body.fields).toMatchObject({ archived: 'invalid_type' });
  });

  it('a placeholder writer that lost the race gets 409 with the winner; a lost-response retry is a no-op', async () => {
    const winner = await putDaily({ id: DAILY_1, bodyMarkdown: 'tab A' });
    expect(winner.status).toBe(200);

    const tabB = await putDaily({ id: DAILY_2, bodyMarkdown: 'tab B' });
    expect(tabB.status).toBe(409);
    expect(tabB.body).toEqual({
      error: 'daily_taken',
      message: 'Daily note already exists for this area and date',
      currentVersion: 1,
      current: winner.body,
    });

    const retry = await putDaily({ id: DAILY_1, bodyMarkdown: 'tab A' });
    expect(retry.status).toBe(200);
    expect(retry.etag).toBe('"1"');
    expect(retry.body).toEqual(winner.body);

    const changed = await putDaily({
      id: DAILY_1,
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
        id: DAILY_3,
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
      current: { id: DAILY_1, bodyMarkdown: 'tab A' },
    });
  });

  it("versioned daily PUTs update the day's note, whatever id they carry", async () => {
    await putDaily({ id: DAILY_1, bodyMarkdown: 'v1' });
    const v2 = await putDaily({ id: DAILY_1, version: 1, bodyMarkdown: 'v2' });
    expect(v2.status).toBe(200);
    expect(v2.etag).toBe('"2"');
    expect(v2.body).toMatchObject({ version: 2, bodyMarkdown: 'v2' });

    const viaIfMatch = await putDaily(
      { id: DAILY_1, bodyMarkdown: 'v3' },
      '"2"',
    );
    expect(viaIfMatch.status).toBe(200);
    expect(viaIfMatch.body).toMatchObject({ version: 3, bodyMarkdown: 'v3' });

    const merged = await putDaily({
      id: DAILY_2,
      version: 3,
      bodyMarkdown: 'merged',
    });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({
      id: DAILY_1,
      version: 4,
      bodyMarkdown: 'merged',
    });

    const stale = await putDaily({
      id: DAILY_1,
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
      { id: DAILY_1, bodyMarkdown: 'old' },
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

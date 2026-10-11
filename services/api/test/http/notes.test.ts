import { describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildDailyNoteClaimItem, keys } from '@gagnechris/data';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-a-notes';
const USER_B = 'user-b-notes';
const PAGE_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DAILY_1 = '01ARZ3NDEKTSV4RRFFQ69G5FC0';
const DAILY_2 = '01ARZ3NDEKTSV4RRFFQ69G5FC1';

type Body = Record<string, unknown>;

const h = useApi('notes-api');

async function call(
  user: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Body }> {
  const res = await h.api.request(method, path, {
    body,
    claims: notebookUser(user),
  });
  return { status: res.status, body: res.body ?? {} };
}

const createNote = (user: string, note: Body) =>
  call(user, 'POST', '/api/notebook/notes', {
    area: 'work',
    bodyMarkdown: '',
    tags: [],
    pinned: false,
    ...note,
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

    const updated = await call(USER_A, 'PUT', `/api/notebook/notes/${PAGE_A}`, {
      version: 1,
      bodyMarkdown: 'no embeds',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.taskIds).toEqual([]);

    const { taskIds: _drop, ...legacy } = stored.Item!;
    await h.doc.send(new PutCommand({ TableName: h.tableName, Item: legacy }));
    const got = await call(USER_A, 'GET', `/api/notebook/notes/${PAGE_A}`);
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
      (await call(USER_B, 'GET', `/api/notebook/notes/${PAGE_A}`)).status,
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

    const edited = await call(USER_A, 'PUT', `/api/notebook/notes/${PAGE_A}`, {
      version: 1,
      title: 'Edited',
    });
    expect(edited.status).toBe(200);

    const feed = await call(USER_A, 'GET', '/api/notebook/sync/changes');
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
        await call(USER_A, 'DELETE', `/api/notebook/notes/${DAILY_1}`, {
          version: first.body.version,
        })
      ).status,
    ).toBe(200);
    const empty = await call(
      USER_A,
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
      (await call(USER_A, 'GET', '/api/notebook/notes/daily/work/2026-10-05'))
        .body,
    ).toMatchObject({ id: DAILY_2 });

    const moved = await call(USER_A, 'PUT', `/api/notebook/notes/${DAILY_2}`, {
      version: 1,
      area: 'personal',
    });
    expect(moved.status).toBe(400);
    expect(moved.body).toMatchObject({ error: 'bad_request' });

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
        await call(USER_A, 'DELETE', `/api/notebook/notes/${DAILY_1}`, {
          version: first.body.version,
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
          call(USER_A, 'PUT', path, {
            id,
            title: id,
            bodyMarkdown: `body ${id}`,
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

  it("batch get reads live notes in request order, leaving out deleted, unknown and other users' ids", async () => {
    expect((await createNote(USER_A, page(PAGE_A, 'Mine'))).status).toBe(201);
    expect((await createNote(USER_A, page(DAILY_1, 'Gone'))).status).toBe(201);
    expect((await createNote(USER_B, page(DAILY_2, 'Theirs'))).status).toBe(
      201,
    );
    expect(
      (
        await call(USER_A, 'DELETE', `/api/notebook/notes/${DAILY_1}`, {
          version: 1,
        })
      ).status,
    ).toBe(200);

    const got = await call(USER_A, 'POST', '/api/notebook/notes/batch', {
      ids: [DAILY_2, '01ARZ3NDEKTSV4RRFFQ69G5FC9', DAILY_1, PAGE_A],
    });
    expect(got.status).toBe(200);
    expect((got.body.items as Body[]).map((n) => n.title)).toEqual(['Mine']);
  });
});

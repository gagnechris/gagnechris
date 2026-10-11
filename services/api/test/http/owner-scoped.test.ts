import { describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-a-owner';
const USER_B = 'user-b-other';
const NOTE_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_A2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const NOTE_B = '01ARZ3NDEKTSV4RRFFQ69G5FB1';
const DAILY_ULID_1 = '01ARZ3NDEKTSV4RRFFQ69G5FC0';
const DAILY_ULID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FC1';
const TASK_1 = '01ARZ3NDEKTSV4RRFFQ69G5FD0';
const TASK_2 = '01ARZ3NDEKTSV4RRFFQ69G5FD1';

type Body = Record<string, unknown>;

const h = useApi('owner-scoped');

async function call(
  user: string,
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string>;
    ifMatch?: string;
  } = {},
): Promise<{ status: number; body: Body }> {
  const res = await h.api.request(method, path, {
    body: opts.body,
    query: opts.query,
    headers: opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined,
    claims: notebookUser(user),
  });
  return { status: res.status, body: res.body ?? {} };
}

async function createDaily(
  user: string,
  id: string,
  fields: { title: string; area: string; date: string },
): Promise<{ status: number; body: Body }> {
  return call(user, 'POST', '/api/notebook/notes', {
    body: { id, type: 'daily', ...fields },
  });
}

const idsOf = (res: { body: Body }) =>
  (res.body.items as Body[]).map((n) => n.id);

describe('owner-scoped notes over HTTP (DynamoDB Local)', () => {
  it('user B gets 404 on GET/PUT/DELETE of user A; lists and feed stay isolated', async () => {
    const aNote = await createDaily(USER_A, NOTE_A, {
      title: 'A private',
      area: 'work',
      date: '2026-10-02',
    });
    expect(aNote.status).toBe(201);
    expect(
      (
        await createDaily(USER_B, NOTE_B, {
          title: 'B private',
          area: 'work',
          date: '2026-10-02',
        })
      ).status,
    ).toBe(201);

    const path = `/api/notebook/notes/${NOTE_A}`;
    const attempts: [string, Parameters<typeof call>[3]][] = [
      ['GET', {}],
      ['PUT', { body: { title: 'hijack' }, ifMatch: '"1"' }],
      ['PUT', { body: { version: 1, title: 'hijack' } }],
      ['DELETE', { ifMatch: '"1"' }],
      ['DELETE', { body: { version: 1 } }],
    ];
    for (const [method, opts] of attempts) {
      const res = await call(USER_B, method, path, opts);
      expect(res.status, `B ${method} ${JSON.stringify(opts)}`).toBe(404);
    }
    expect((await call(USER_A, 'GET', path)).body).toMatchObject({
      title: 'A private',
      version: 1,
      deleted: false,
    });

    // A's id lookup of B's note is a miss (different pk).
    expect(
      (await call(USER_A, 'GET', `/api/notebook/notes/${NOTE_B}`)).status,
    ).toBe(404);

    const aList = await call(USER_A, 'GET', '/api/notebook/notes', {
      query: { area: 'work' },
    });
    expect(idsOf(aList)).toEqual([NOTE_A]);
    expect((aList.body.items as Body[]).every((n) => n.userId === USER_A)).toBe(
      true,
    );

    const feedA = await call(USER_A, 'GET', '/api/notebook/sync/changes');
    expect((feedA.body.changes as Body[]).map((c) => c.id)).toEqual([NOTE_A]);
    const feedB = await call(USER_B, 'GET', '/api/notebook/sync/changes');
    expect((feedB.body.changes as Body[]).map((c) => c.id)).toEqual([NOTE_B]);
  });

  it('two daily-note creates (same area/date, different ULIDs) keep one winner; loser gets daily_taken', async () => {
    const first = await createDaily(USER_A, DAILY_ULID_1, {
      title: 'device-1',
      area: 'personal',
      date: '2026-10-02',
    });
    expect(first.status).toBe(201);
    const second = await createDaily(USER_A, DAILY_ULID_2, {
      title: 'device-2',
      area: 'personal',
      date: '2026-10-02',
    });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: 'daily_taken',
      current: { id: first.body.id, title: 'device-1' },
    });
    expect(
      (await call(USER_A, 'GET', `/api/notebook/notes/${DAILY_ULID_2}`)).status,
    ).toBe(404);
    expect(
      (await call(USER_A, 'GET', `/api/notebook/notes/${DAILY_ULID_1}`)).body,
    ).toMatchObject({
      title: 'device-1',
      area: 'personal',
      date: '2026-10-02',
    });
    const claimKey = keys.notebook.dailyClaim(USER_A, 'personal', '2026-10-02');
    expect(claimKey).toEqual({
      pk: `USER#${USER_A}#DAILY#personal#2026-10-02`,
      sk: 'NOTE',
    });
    const claim = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: claimKey,
        ConsistentRead: true,
      }),
    );
    expect(claim.Item).toMatchObject({ noteId: DAILY_ULID_1 });
  });

  it('pages the area index and the note-tasks index with per-index cursors', async () => {
    for (const [id, title, date] of [
      [NOTE_A, 'n1', '2026-10-01'],
      [NOTE_A2, 'n2', '2026-10-02'],
    ] as const) {
      expect(
        (await createDaily(USER_A, id, { title, area: 'work', date })).status,
      ).toBe(201);
    }
    for (const id of [TASK_1, TASK_2]) {
      expect(
        (
          await call(USER_A, 'POST', '/api/notebook/tasks', {
            body: { id, area: 'work', title: id, noteId: NOTE_A },
          })
        ).status,
      ).toBe(201);
    }

    const notesPage = (query: Record<string, string>) =>
      call(USER_A, 'GET', '/api/notebook/notes', { query });

    const gsi1Page1 = await notesPage({ area: 'work', limit: '1' });
    expect(gsi1Page1.status).toBe(200);
    expect(gsi1Page1.body.items).toHaveLength(1);
    const gsi1Cursor = gsi1Page1.body.nextCursor as string;
    expect(gsi1Cursor).toBeTruthy();
    // The cursor belongs to the work partition of the area index.
    expect(
      (await notesPage({ area: 'personal', limit: '1', cursor: gsi1Cursor }))
        .status,
    ).toBe(400);

    const gsi1Page2 = await notesPage({
      area: 'work',
      limit: '1',
      cursor: gsi1Cursor,
    });
    expect(gsi1Page2.status).toBe(200);
    expect(gsi1Page2.body.items).toHaveLength(1);
    expect(idsOf(gsi1Page2)[0]).not.toBe(idsOf(gsi1Page1)[0]);

    const tasksPage = (query: Record<string, string>) =>
      call(USER_A, 'GET', '/api/notebook/tasks', { query });
    const gsi2Page = await tasksPage({ noteId: NOTE_A, limit: '1' });
    expect(gsi2Page.status).toBe(200);
    expect(gsi2Page.body.items).toHaveLength(1);
    expect([TASK_1, TASK_2]).toContain(idsOf(gsi2Page)[0]);
    expect((gsi2Page.body.items as Body[])[0]!.noteId).toBe(NOTE_A);
    const gsi2Cursor = gsi2Page.body.nextCursor as string;
    expect(gsi2Cursor).toBeTruthy();
    expect(
      (await tasksPage({ noteId: NOTE_A2, limit: '1', cursor: gsi2Cursor }))
        .status,
    ).toBe(400);
    expect(
      (await notesPage({ area: 'work', limit: '1', cursor: gsi2Cursor }))
        .status,
    ).toBe(400);
    const gsi2Page2 = await tasksPage({
      noteId: NOTE_A,
      limit: '1',
      cursor: gsi2Cursor,
    });
    expect(gsi2Page2.status).toBe(200);
    expect([...idsOf(gsi2Page), ...idsOf(gsi2Page2)].sort()).toEqual(
      [TASK_1, TASK_2].sort(),
    );

    // Soft-delete drops list GSI keys so area lists no longer return the row.
    const live = (gsi1Page1.body.items as Body[])[0]!;
    expect(
      (
        await call(USER_A, 'DELETE', `/api/notebook/notes/${live.id}`, {
          body: { version: live.version },
        })
      ).status,
    ).toBe(200);
    const tombstone = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(USER_A, live.id as string),
        ConsistentRead: true,
      }),
    );
    expect(tombstone.Item).toMatchObject({ deleted: true });
    expect(tombstone.Item?.gsi1pk).toBeUndefined();
    const afterDelete = await notesPage({ area: 'work' });
    expect(idsOf(afterDelete)).not.toContain(live.id);
  });
});

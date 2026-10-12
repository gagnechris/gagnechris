import { describe, expect, it } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  keys,
  ownerSyncCreateClaimPk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  SYNC_TOMBSTONE_TTL_DAYS,
  syncCreateClaimSk,
  syncPk,
  syncResyncHorizonIso,
  syncSk,
  ttlDaysFromNow,
} from '@gagnechris/data';
import { CLIENT_VERSION_HEADER, PAGE_LIMIT_MAX } from '@gagnechris/shared';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-sync-feed';
const OTHER = 'user-sync-feed-other';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const NOTE_ID_3 = '01ARZ3NDEKTSV4RRFFQ69G5FB1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FB2';
const BAD_NOTE = '01ARZ3NDEKTSV4RRFFQ69G5F00';
const BAD_TASK = '01ARZ3NDEKTSV4RRFFQ69G5F01';
const DAY_MS = 86_400_000;

const INVALID_CURSOR = {
  error: 'bad_request',
  message: 'Invalid pagination cursor',
};

type Change = {
  type: string;
  id: string;
  version: number;
  deleted: boolean;
  updatedAt: string;
  entity?: Record<string, unknown>;
};

type Page = { changes: Change[]; nextSince: string; nextCursor?: string };

const h = useApi('sync-feed');
const { call, ok } = apiCalls(h, { user: USER });

const sync = (
  query: Record<string, string> = {},
  opts: { user?: string; headers?: Record<string, string> } = {},
) => call('GET', '/api/notebook/sync/changes', { query, ...opts });

async function okSync(query: Record<string, string> = {}): Promise<Page> {
  const res = await sync(query);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Page;
}

const write = (method: string, path: string, body?: unknown) =>
  ok<{ id: string; version: number; updatedAt: string }>(method, path, {
    body,
  });

const createNote = (id: string, title: string) =>
  write('POST', '/api/notebook/notes', {
    id,
    area: 'work',
    type: 'page',
    title,
  });

async function seedThree() {
  const out = [];
  for (const [id, title] of [
    [NOTE_ID, 'n0'],
    [NOTE_ID_2, 'n1'],
    [NOTE_ID_3, 'n2'],
  ] as const) {
    out.push(await createNote(id, title));
    // Distinct updatedAt milliseconds keep the feed order deterministic.
    await new Promise((r) => setTimeout(r, 5));
  }
  return out;
}

async function pageAll(query: Record<string, string>): Promise<Change[][]> {
  const pages: Change[][] = [];
  let cursor: string | undefined;
  do {
    const page = await okSync({ ...query, ...(cursor ? { cursor } : {}) });
    pages.push(page.changes);
    cursor = page.nextCursor;
  } while (cursor);
  return pages;
}

describe('sync feed over HTTP (DynamoDB Local)', () => {
  it('pages notes and tasks in updatedAt order, each change once, with full change bodies', async () => {
    const notes = await seedThree();
    const task = await write('POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 'Task',
    });
    const deleted = await write('DELETE', `/api/notebook/notes/${NOTE_ID}`, {
      version: 1,
    });

    const pages = await pageAll({ limit: '2' });
    expect(pages.slice(0, 2).map((p) => p.length)).toEqual([2, 2]);
    const all = pages.flat();
    expect(all.map((c) => c.id)).toEqual([
      NOTE_ID_2,
      NOTE_ID_3,
      TASK_ID,
      NOTE_ID,
    ]);
    expect(all[0]).toEqual({
      type: 'note',
      id: NOTE_ID_2,
      version: 1,
      deleted: false,
      updatedAt: notes[1]!.updatedAt,
      entity: notes[1],
    });
    expect(all[2]).toEqual({
      type: 'task',
      id: TASK_ID,
      version: 1,
      deleted: false,
      updatedAt: task.updatedAt,
      entity: task,
    });
    expect(all[3]).toEqual({
      type: 'note',
      id: NOTE_ID,
      version: 2,
      deleted: true,
      updatedAt: deleted.updatedAt,
    });

    const before = new Date().toISOString();
    const full = await okSync();
    const after = new Date().toISOString();
    expect(full.nextCursor).toBeUndefined();
    expect(full.nextSince >= before && full.nextSince <= after).toBe(true);
    expect(full.changes).toEqual(all);
  });

  it('since without ms or with an offset returns the same changes as UTC ms', async () => {
    const [first] = await seedThree();
    const at = new Date(Date.parse(first!.updatedAt) - 1000);
    const utcMs = at.toISOString();
    const noMs = `${utcMs.slice(0, 19)}Z`;
    const offset = new Date(at.getTime() - 5 * 3_600_000)
      .toISOString()
      .replace('Z', '-05:00');
    const ids = async (since: string) =>
      (await okSync({ since })).changes.map((c) => c.id);
    expect(await ids(utcMs)).toEqual([NOTE_ID, NOTE_ID_2, NOTE_ID_3]);
    expect(await ids(noMs)).toEqual(await ids(utcMs));
    expect(await ids(offset)).toEqual(await ids(utcMs));
  });

  it('answers 410 resync_required past the horizon and 200 just inside it', async () => {
    const resync = {
      error: 'resync_required',
      message:
        'Sync watermark is older than the tombstone retention horizon; full resync required',
    };
    for (const days of [
      SYNC_TOMBSTONE_TTL_DAYS + 2,
      SYNC_TOMBSTONE_TTL_DAYS + 0.5,
    ]) {
      const since = new Date(Date.now() - days * DAY_MS).toISOString();
      expect(await sync({ since })).toEqual({ status: 410, body: resync });
    }
    const horizon = Date.parse(syncResyncHorizonIso(new Date()));
    const outside = new Date(horizon - 60_000).toISOString();
    expect((await sync({ since: outside })).status).toBe(410);
    const inside = new Date(horizon + 60_000).toISOString();
    expect(await sync({ since: inside })).toMatchObject({
      status: 200,
      body: { changes: [] },
    });
  });

  it('a cursor is bound to its user and its since; an equivalent offset since is accepted', async () => {
    await seedThree();

    const unbound = await okSync({ limit: '2' });
    expect(unbound.nextCursor).toBeTruthy();
    const reusedWithSince = await sync({
      cursor: unbound.nextCursor!,
      since: new Date(Date.now() - DAY_MS).toISOString(),
      limit: '2',
    });
    expect(reusedWithSince).toEqual({ status: 400, body: INVALID_CURSOR });
    const sameShape = await okSync({ cursor: unbound.nextCursor!, limit: '2' });
    expect(sameShape.changes.map((c) => c.id)).toEqual([NOTE_ID_3]);

    const sinceAt = new Date(Date.now() - DAY_MS);
    const since = sinceAt.toISOString();
    const bound = await okSync({ since, limit: '2' });
    expect(bound.nextCursor).toBeTruthy();
    const otherSince = await sync({
      since: new Date(sinceAt.getTime() + 60_000).toISOString(),
      cursor: bound.nextCursor!,
      limit: '2',
    });
    expect(otherSince).toEqual({ status: 400, body: INVALID_CURSOR });
    const noSince = await sync({ cursor: bound.nextCursor!, limit: '2' });
    expect(noSince).toEqual({ status: 400, body: INVALID_CURSOR });
    const offsetSince = new Date(sinceAt.getTime() - 5 * 3_600_000)
      .toISOString()
      .replace('Z', '-05:00');
    const page2 = await okSync({
      since: offsetSince,
      cursor: bound.nextCursor!,
      limit: '2',
    });
    expect(page2.changes.map((c) => c.id)).toEqual([NOTE_ID_3]);

    const otherUser = await sync(
      { cursor: unbound.nextCursor!, limit: '2' },
      { user: OTHER },
    );
    expect(otherUser).toEqual({ status: 400, body: INVALID_CURSOR });

    const meta = keys.notebook.note.meta(OTHER, NOTE_ID);
    const forged = Buffer.from(
      JSON.stringify({
        ...meta,
        syncPk: syncPk(OTHER),
        syncSk: syncSk(new Date().toISOString(), 'note', NOTE_ID),
        boundSince: '',
      }),
      'utf8',
    ).toString('base64url');
    expect(await sync({ cursor: forged })).toEqual({
      status: 400,
      body: INVALID_CURSOR,
    });
    for (const cursor of [
      'not-a-cursor',
      Buffer.from('[]').toString('base64url'),
    ]) {
      expect(await sync({ cursor }), cursor).toEqual({
        status: 400,
        body: INVALID_CURSOR,
      });
    }
  });

  it('rejects malformed query values with 400 field codes', async () => {
    const cases: [Record<string, string>, Record<string, string>][] = [
      [{ since: 'yesterday' }, { since: 'invalid_format' }],
      [{ limit: '0' }, { limit: 'too_small' }],
      [{ limit: String(PAGE_LIMIT_MAX + 1) }, { limit: 'too_big' }],
    ];
    for (const [query, fields] of cases) {
      const res = await sync(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(res.body, JSON.stringify(query)).toEqual({
        error: 'bad_request',
        message: 'Invalid query parameters',
        fields,
      });
    }
  });

  it(`${CLIENT_VERSION_HEADER}: a well-formed version or none is served, a malformed one is 400`, async () => {
    for (const headers of <Record<string, string>[]>[
      { [CLIENT_VERSION_HEADER]: '0.0.0' },
      { [CLIENT_VERSION_HEADER]: '2.1.0' },
      { [CLIENT_VERSION_HEADER]: ' 10.0.0 ' },
      { 'X-Gagnechris-Client-Version': '3.0.0' },
      {},
    ]) {
      const res = await sync({}, { headers });
      expect(res.status, JSON.stringify(headers)).toBe(200);
    }
    for (const value of ['v1', '1.0', '1.0.0-beta', 'latest']) {
      const res = await sync(
        {},
        { headers: { [CLIENT_VERSION_HEADER]: value } },
      );
      expect(res.status, value).toBe(400);
      expect(res.body, value).toEqual({
        error: 'bad_request',
        message: `Invalid ${CLIENT_VERSION_HEADER} header`,
      });
    }
  });

  it('skips corrupt rows, still returns the rest, and limit counts returned changes', async () => {
    const good = await createNote(NOTE_ID, 'Good note');
    const task = await write('POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 'Good task',
    });
    const stamp = new Date(Date.parse(good.updatedAt) - 60_000).toISOString();
    const corrupt = (
      key: { pk: string; sk: string },
      type: string,
      id: string,
    ) => {
      h.corruptRow(key);
      return h.doc.send(
        new PutCommand({
          TableName: h.tableName,
          // Fails the item schema: no area, title, version, timestamps.
          Item: {
            ...key,
            entityType: type,
            id,
            userId: USER,
            syncPk: syncPk(USER),
            syncSk: syncSk(stamp, type, id),
          },
        }),
      );
    };
    await corrupt(keys.notebook.note.meta(USER, BAD_NOTE), 'note', BAD_NOTE);
    await corrupt(keys.notebook.task.meta(USER, BAD_TASK), 'task', BAD_TASK);

    const full = await okSync();
    expect(full.changes.map((c) => [c.type, c.id])).toEqual([
      ['note', NOTE_ID],
      ['task', TASK_ID],
    ]);
    expect(full.changes[1]!.entity).toEqual(task);

    const first = await okSync({ limit: '1' });
    expect(first.changes.map((c) => c.id)).toEqual([NOTE_ID]);
    expect(first.nextCursor).toBeTruthy();
    const second = await okSync({ limit: '1', cursor: first.nextCursor! });
    expect(second.changes.map((c) => c.id)).toEqual([TASK_ID]);

    const pages = await pageAll({ limit: '1' });
    expect(pages.flat().map((c) => c.id)).toEqual([NOTE_ID, TASK_ID]);
  });

  it('delete extends create-claim TTL from delete time', async () => {
    const claimKey = {
      pk: ownerSyncCreateClaimPk(USER, 'note', NOTE_ID),
      sk: syncCreateClaimSk(),
    };
    const readTtl = async () =>
      (
        await h.doc.send(
          new GetCommand({
            TableName: h.tableName,
            Key: claimKey,
            ConsistentRead: true,
          }),
        )
      ).Item?.ttl as number | undefined;

    const createFrom = new Date();
    await createNote(NOTE_ID, 'claim-ttl');
    const createTo = new Date();
    const before = await readTtl();
    expect(before).toBeGreaterThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, createFrom),
    );
    expect(before).toBeLessThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, createTo),
    );

    // The TTL has one-second resolution; let the delete land in a later second.
    await new Promise((r) => setTimeout(r, 1_100));

    const deleteFrom = new Date();
    await write('DELETE', `/api/notebook/notes/${NOTE_ID}`, { version: 1 });
    const deleteTo = new Date();
    const after = await readTtl();
    expect(after).toBeGreaterThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, deleteFrom),
    );
    expect(after).toBeLessThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, deleteTo),
    );
    expect(after).toBeGreaterThan(before!);
  });
});

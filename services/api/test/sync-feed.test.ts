import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_LAMBDA_TIMEOUT_MS,
  keys,
  SYNC_OVERLAP_MS,
  SYNC_TOMBSTONE_TTL_DAYS,
  syncPk,
  syncResyncHorizonIso,
  syncSk,
} from '@gagnechris/data';
import { CLIENT_VERSION_HEADER } from '@gagnechris/shared';
import { SyncLedger } from '../src/sync/ledger.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createSyncRoutes } from '../src/sync/handlers.js';
import { dispatchRoutes } from '../src/router.js';
import { makeEvent } from './support/make-event.js';
import { createMemoryDoc } from './support/memory-doc.js';
import {
  buildFakeNote,
  createFakeNotesRepo,
  FAKE_NOTE_CHANGE_TYPE,
  registerFakeNoteSync,
  TestSyncChangesResponseSchema,
} from './support/fake-note.js';
import { createFakeNoteRoutes } from './support/fake-note-routes.js';
import { metrics } from '../src/observability.js';

const TABLE = 'gagnechris-test';
const USER = 'user-1';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const NOTE_ID_3 = '01ARZ3NDEKTSV4RRFFQ69G5FB1';

function adminEvent(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  query?: Record<string, string>,
) {
  return makeEvent(method, path, {
    body,
    headers,
    query,
    jwtClaims: { sub: USER },
  });
}

describe('sync feed (CHR-153 / CHR-162 / CHR-172)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerFakeNoteSync();
  });

  it('overlap is at least the API Lambda timeout', () => {
    expect(SYNC_OVERLAP_MS).toBeGreaterThanOrEqual(API_LAMBDA_TIMEOUT_MS);
  });

  async function pollSince(since: string, now: string) {
    const { doc } = createMemoryDoc();
    const ledger = new SyncLedger(doc, TABLE, () => now);
    const routes = createSyncRoutes(ledger);
    return dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/sync/changes', undefined, undefined, {
        since,
      }),
      'GET',
      '/api/notebook/sync/changes',
    );
  }

  it('stale since returns 410 resync_required (CHR-172)', async () => {
    const now = '2026-10-02T12:00:00.000Z';
    const stale = new Date(
      Date.parse(now) - (SYNC_TOMBSTONE_TTL_DAYS + 2) * 86_400_000,
    ).toISOString();
    expect(Date.parse(stale)).toBeLessThan(
      Date.parse(syncResyncHorizonIso(new Date(now))),
    );
    const res = await pollSince(stale, now);
    expect(res?.statusCode).toBe(410);
    expect(JSON.parse(res!.body as string)).toMatchObject({
      error: 'resync_required',
    });
  });

  it('since older than TTL minus margin returns 410; just inside returns 200 (CHR-202)', async () => {
    const now = '2026-10-02T12:00:00.000Z';
    const horizonMs = Date.parse(syncResyncHorizonIso(new Date(now)));
    // The horizon sits inside the TTL window: tombstones written at or after
    // since − overlap cannot have been purged yet.
    expect(horizonMs - SYNC_OVERLAP_MS).toBeGreaterThan(
      Date.parse(now) - SYNC_TOMBSTONE_TTL_DAYS * 86_400_000,
    );

    // 30.5 days: tombstones may already be purged (used to return 200).
    const halfDayPastTtl = new Date(
      Date.parse(now) - (SYNC_TOMBSTONE_TTL_DAYS + 0.5) * 86_400_000,
    ).toISOString();
    expect((await pollSince(halfDayPastTtl, now))?.statusCode).toBe(410);

    const justOutside = new Date(horizonMs - 1).toISOString();
    expect((await pollSince(justOutside, now))?.statusCode).toBe(410);

    const justInside = new Date(horizonMs).toISOString();
    expect((await pollSince(justInside, now))?.statusCode).toBe(200);
  });

  it('since without ms or with offset returns the same changes as UTC-ms', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T22:00:00.500Z',
    );
    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T23:00:00.000Z');

    await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T22:00:00.500Z'),
    );

    const utcMs = await ledger.queryChangesSince(USER, {
      since: '2026-09-28T22:00:00.000Z',
    });
    const noMs = await ledger.queryChangesSince(USER, {
      since: '2026-09-28T22:00:00Z',
    });
    const offset = await ledger.queryChangesSince(USER, {
      since: '2026-09-28T17:00:00.000-05:00',
    });

    expect(utcMs.changes).toHaveLength(1);
    expect(noMs.changes.map((c) => c.id)).toEqual(
      utcMs.changes.map((c) => c.id),
    );
    expect(offset.changes.map((c) => c.id)).toEqual(
      utcMs.changes.map((c) => c.id),
    );
    // Regression: raw string compare of `22:00:00Z` vs `22:00:00.500Z` used to skip.
    expect(noMs.changes[0]!.updatedAt).toBe('2026-09-28T22:00:00.500Z');
  });

  it('watermark + overlap window delivers a late-committed write', async () => {
    const { doc } = createMemoryDoc();
    let now = '2026-09-28T22:00:01.000Z';
    const ledger = new SyncLedger(doc, TABLE, () => now);

    // First poll: empty feed, client stores nextSince = T1.
    now = '2026-09-28T22:00:02.000Z';
    const first = await ledger.queryChangesSince(USER, {});
    expect(first.changes).toHaveLength(0);
    expect(first.nextSince).toBe('2026-09-28T22:00:02.000Z');

    // Write stamped at t=100 (before watermark) commits after the poll.
    // 6s lag used to miss with 5s overlap; 15s overlap covers Lambda timeout.
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T21:59:56.000Z',
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'late' },
        '2026-09-28T21:59:56.000Z',
      ),
    );

    now = '2026-09-28T22:00:03.000Z';
    const second = await ledger.queryChangesSince(USER, {
      since: first.nextSince,
    });
    expect(second.changes).toHaveLength(1);
    expect(second.changes[0]!.id).toBe(NOTE_ID);
    expect(second.changes[0]!.updatedAt).toBe('2026-09-28T21:59:56.000Z');
  });

  it('stamps entityType even when toItem omits it', async () => {
    const { doc, store } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'no-entity-type' },
        '2026-09-28T10:00:00.000Z',
      ),
    );

    const meta = store.get(
      `${keys.notebook.note.meta(USER, NOTE_ID).pk}\0META`,
    );
    expect(meta?.entityType).toBe(FAKE_NOTE_CHANGE_TYPE);

    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T11:00:00.000Z');
    const feed = await ledger.queryChangesSince(USER, {});
    expect(feed.changes).toHaveLength(1);
    expect(feed.changes[0]!.type).toBe(FAKE_NOTE_CHANGE_TYPE);
  });

  it('one feed row per entity with latest state; tombstones until TTL', async () => {
    const times = [
      '2026-09-28T10:00:00.000Z',
      '2026-09-28T11:00:00.000Z',
      '2026-09-28T12:00:00.000Z',
    ];
    let tick = 0;
    const nowIso = () => times[tick++] ?? times[times.length - 1]!;

    const { doc, store } = createMemoryDoc();
    const repo = createFakeNotesRepo(doc, TABLE, nowIso);
    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T13:00:00.000Z');

    const created = await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A', body: 'one' }, times[0]!),
    );
    expect(created.version).toBe(1);

    await repo.updateIfVersion({ userId: USER, id: NOTE_ID }, 1, {
      ...created,
      title: 'B',
      version: 2,
      updatedAt: times[1]!,
    });

    await repo.softDelete({ userId: USER, id: NOTE_ID }, 2, {
      ...created,
      title: 'B',
      version: 3,
      updatedAt: times[2]!,
      deleted: true,
    });

    // One META row (not three ledger rows) + durable create claim.
    const metaRows = [...store.values()].filter(
      (item) => item.entityType === FAKE_NOTE_CHANGE_TYPE,
    );
    expect(metaRows).toHaveLength(1);
    expect(metaRows[0]!.version).toBe(3);
    expect(metaRows[0]!.deleted).toBe(true);
    expect(metaRows[0]!.ttl).toEqual(expect.any(Number));
    expect(metaRows[0]!.syncPk).toBe(`SYNC#${USER}`);
    expect(
      [...store.values()].some((i) => i.entityType === 'syncCreateClaim'),
    ).toBe(true);

    const feed = await ledger.queryChangesSince(USER, {});
    expect(feed.changes).toHaveLength(1);
    expect(feed.changes[0]).toMatchObject({
      type: FAKE_NOTE_CHANGE_TYPE,
      id: NOTE_ID,
      version: 3,
      deleted: true,
    });
    expect(feed.changes[0]!.entity).toBeUndefined();
  });

  it('post-TTL create replay does not resurrect a deleted entity', async () => {
    const { doc, store } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    const created = await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    await repo.softDelete({ userId: USER, id: NOTE_ID }, 1, {
      ...created,
      version: 2,
      updatedAt: '2026-09-28T11:00:00.000Z',
      deleted: true,
    });

    // Simulate DynamoDB TTL purge of the META tombstone (claim remains).
    store.delete(`${keys.notebook.note.meta(USER, NOTE_ID).pk}\0META`);

    await expect(
      repo.createIdempotent(
        buildFakeNote(
          USER,
          NOTE_ID,
          { title: 'A' },
          '2026-10-30T10:00:00.000Z',
        ),
      ),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      message: expect.stringContaining('was deleted'),
    });
    expect(
      store.has(`${keys.notebook.note.meta(USER, NOTE_ID).pk}\0META`),
    ).toBe(false);
  });

  it('pages with real ExclusiveStartKey across multiple entities', async () => {
    const { doc } = createMemoryDoc();
    const stamps = [
      '2026-09-28T10:00:00.000Z',
      '2026-09-28T11:00:00.000Z',
      '2026-09-28T12:00:00.000Z',
    ];
    const ids = [NOTE_ID, NOTE_ID_2, NOTE_ID_3];
    for (let i = 0; i < 3; i += 1) {
      const repo = createFakeNotesRepo(doc, TABLE, () => stamps[i]!);
      await repo.createIdempotent(
        buildFakeNote(USER, ids[i]!, { title: `n${i}` }, stamps[i]!),
      );
    }

    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T13:00:00.000Z');
    const page1 = await ledger.queryChangesSince(USER, { limit: 2 });
    expect(page1.changes).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await ledger.queryChangesSince(USER, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.changes).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();

    const allIds = [...page1.changes, ...page2.changes].map((c) => c.id);
    expect(allIds).toEqual(ids);
  });

  it('a registered adapter + repository sync config reaches the feed (no ledger edits)', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'via-config' },
        '2026-09-28T10:00:00.000Z',
      ),
    );

    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T11:00:00.000Z');
    const routes = createSyncRoutes(ledger, {
      responseSchema: TestSyncChangesResponseSchema,
    });
    const res = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/sync/changes'),
      'GET',
      '/api/notebook/sync/changes',
    );
    expect(res?.statusCode).toBe(200);
    const feed = JSON.parse(res!.body as string);
    expect(feed.changes).toHaveLength(1);
    expect(feed.changes[0].type).toBe(FAKE_NOTE_CHANGE_TYPE);
    expect(feed.changes[0].entity).toMatchObject({ title: 'via-config' });
    expect(feed.nextSince).toBe('2026-09-28T11:00:00.000Z');
  });

  it('idempotent create retries do not duplicate sync rows; payload mismatch 409s', async () => {
    const { doc, store } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );

    const first = await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    const second = await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    expect(second).toEqual(first);
    expect(
      [...store.values()].filter((i) => i.entityType === FAKE_NOTE_CHANGE_TYPE),
    ).toHaveLength(1);

    await expect(
      repo.createIdempotent(
        buildFakeNote(
          USER,
          NOTE_ID,
          { title: 'B' },
          '2026-09-28T10:00:00.000Z',
        ),
      ),
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  it('create retry after a legitimate update still matches createHash', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    const created = await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'A', body: 'one' },
        '2026-09-28T10:00:00.000Z',
      ),
    );
    await repo.updateIfVersion({ userId: USER, id: NOTE_ID }, 1, {
      ...created,
      title: 'B',
      body: 'two',
      version: 2,
      updatedAt: '2026-09-28T11:00:00.000Z',
    });

    // Delayed identical create retry uses stored createHash, not current fields.
    const retried = await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'A', body: 'one' },
        '2026-09-28T10:00:00.000Z',
      ),
    );
    expect(retried.version).toBe(2);
    expect(retried.title).toBe('B');
  });
});

describe('sync contract hardening (CHR-202)', () => {
  const NOW = '2026-09-28T13:00:00.000Z';
  const STAMPS = [
    '2026-09-28T10:00:00.000Z',
    '2026-09-28T11:00:00.000Z',
    '2026-09-28T12:00:00.000Z',
  ];

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerFakeNoteSync();
  });

  async function seedNotes(doc: ReturnType<typeof createMemoryDoc>['doc']) {
    const ids = [NOTE_ID, NOTE_ID_2, NOTE_ID_3];
    for (let i = 0; i < ids.length; i += 1) {
      const repo = createFakeNotesRepo(doc, TABLE, () => STAMPS[i]!);
      await repo.createIdempotent(
        buildFakeNote(USER, ids[i]!, { title: `n${i}` }, STAMPS[i]!),
      );
    }
    return ids;
  }

  function syncGet(
    query?: Record<string, string>,
    headers?: Record<string, string>,
  ) {
    return adminEvent(
      'GET',
      '/api/notebook/sync/changes',
      undefined,
      headers,
      query,
    );
  }

  function dispatchSync(
    routes: ReturnType<typeof createSyncRoutes>,
    event: ReturnType<typeof syncGet>,
  ) {
    return dispatchRoutes(routes, event, 'GET', '/api/notebook/sync/changes');
  }

  it('a row with no registered adapter fails the page with 500 + SyncAdapterMissing', async () => {
    const { doc } = createMemoryDoc();
    await seedNotes(doc);
    clearSyncEntities();
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const routes = createSyncRoutes(new SyncLedger(doc, TABLE, () => NOW));
    const res = await dispatchSync(routes, syncGet());
    expect(res?.statusCode).toBe(500);
    expect(JSON.parse(res!.body as string)).toMatchObject({
      error: 'sync_adapter_missing',
    });
    expect(addMetric).toHaveBeenCalledWith(
      'SyncAdapterMissing',
      expect.anything(),
      1,
    );
    addMetric.mockRestore();
  });

  it('a cursor minted without since is rejected when reused with since', async () => {
    const { doc } = createMemoryDoc();
    await seedNotes(doc);
    const ledger = new SyncLedger(doc, TABLE, () => NOW);
    const page1 = await ledger.queryChangesSince(USER, { limit: 2 });
    expect(page1.nextCursor).toBeTruthy();

    const routes = createSyncRoutes(ledger, {
      responseSchema: TestSyncChangesResponseSchema,
    });
    const reused = await dispatchSync(
      routes,
      syncGet({
        cursor: page1.nextCursor!,
        since: '2026-09-28T09:00:00.000Z',
        limit: '2',
      }),
    );
    expect(reused?.statusCode).toBe(400);
    expect(JSON.parse(reused!.body as string)).toMatchObject({
      error: 'bad_request',
      message: 'Invalid pagination cursor',
    });

    // Same query shape as minted → accepted.
    const ok = await dispatchSync(
      routes,
      syncGet({ cursor: page1.nextCursor!, limit: '2' }),
    );
    expect(ok?.statusCode).toBe(200);
  });

  it('a cursor minted for one since is rejected under another since', async () => {
    const { doc } = createMemoryDoc();
    await seedNotes(doc);
    const ledger = new SyncLedger(doc, TABLE, () => NOW);
    const page1 = await ledger.queryChangesSince(USER, {
      since: '2026-09-28T09:00:00.000Z',
      limit: 2,
    });
    await expect(
      ledger.queryChangesSince(USER, {
        since: '2026-09-28T09:30:00.000Z',
        cursor: page1.nextCursor,
        limit: 2,
      }),
    ).rejects.toThrow(SyntaxError);
    // Equivalent instant in another offset normalizes to the same binding.
    const page2 = await ledger.queryChangesSince(USER, {
      since: '2026-09-28T04:00:00.000-05:00',
      cursor: page1.nextCursor,
      limit: 2,
    });
    expect(page2.changes.map((c) => c.id)).toEqual([NOTE_ID_3]);
  });

  it("a cursor for another user's partition is rejected with 400", async () => {
    const { doc } = createMemoryDoc();
    await seedNotes(doc);
    const meta = keys.notebook.note.meta('user-2', NOTE_ID);
    const forged = Buffer.from(
      JSON.stringify({
        ...meta,
        syncPk: syncPk('user-2'),
        syncSk: syncSk(STAMPS[0]!, FAKE_NOTE_CHANGE_TYPE, NOTE_ID),
        boundSince: '',
      }),
      'utf8',
    ).toString('base64url');
    const routes = createSyncRoutes(new SyncLedger(doc, TABLE, () => NOW), {
      responseSchema: TestSyncChangesResponseSchema,
    });
    const res = await dispatchSync(routes, syncGet({ cursor: forged }));
    expect(res?.statusCode).toBe(400);
  });

  it('limit counts returned changes, not skipped corrupt rows', async () => {
    const { doc, store } = createMemoryDoc();
    const ids = await seedNotes(doc);
    // Corrupt fixture row sorted first: its adapter returns undefined.
    const corruptId = '01ARZ3NDEKTSV4RRFFQ69G5F00';
    const corrupt = keys.notebook.note.meta(USER, corruptId);
    store.set(`${corrupt.pk}\0${corrupt.sk}`, {
      ...corrupt,
      entityType: FAKE_NOTE_CHANGE_TYPE,
      id: corruptId,
      syncPk: syncPk(USER),
      syncSk: syncSk(
        '2026-09-28T09:00:00.000Z',
        FAKE_NOTE_CHANGE_TYPE,
        corruptId,
      ),
    });

    const ledger = new SyncLedger(doc, TABLE, () => NOW);
    const page1 = await ledger.queryChangesSince(USER, { limit: 2 });
    expect(page1.changes.map((c) => c.id)).toEqual(ids.slice(0, 2));
    const page2 = await ledger.queryChangesSince(USER, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.changes.map((c) => c.id)).toEqual(ids.slice(2));
  });

  describe(`${CLIENT_VERSION_HEADER} minimum`, () => {
    function routesWithMin(minClientVersion: string) {
      const { doc } = createMemoryDoc();
      return createSyncRoutes(new SyncLedger(doc, TABLE, () => NOW), {
        minClientVersion,
      });
    }

    it('below the minimum returns 426 upgrade_required', async () => {
      const res = await dispatchSync(
        routesWithMin('2.1.0'),
        syncGet(undefined, { [CLIENT_VERSION_HEADER]: '2.0.9' }),
      );
      expect(res?.statusCode).toBe(426);
      expect(res?.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(res!.body as string)).toEqual({
        error: 'upgrade_required',
        message: expect.stringContaining('2.0.9'),
        minClientVersion: '2.1.0',
      });
    });

    it('at or above the minimum, or without the header, is allowed', async () => {
      const routes = routesWithMin('2.1.0');
      const cases: Array<Record<string, string> | undefined> = [
        { [CLIENT_VERSION_HEADER]: '2.1.0' },
        { [CLIENT_VERSION_HEADER]: '10.0.0' },
        { 'X-Gagnechris-Client-Version': '3.0.0' },
        undefined,
      ];
      for (const headers of cases) {
        const res = await dispatchSync(routes, syncGet(undefined, headers));
        expect(res?.statusCode).toBe(200);
      }
    });

    it('a malformed version header returns 400', async () => {
      const res = await dispatchSync(
        routesWithMin('1.0.0'),
        syncGet(undefined, { [CLIENT_VERSION_HEADER]: 'v1' }),
      );
      expect(res?.statusCode).toBe(400);
    });
  });
});

describe('If-Match / ETag routes (CHR-162)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerFakeNoteSync();
  });

  it('If-Match: W/"3" with a stale version returns 412 with current', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    let note = await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    note = await repo.updateIfVersion({ userId: USER, id: NOTE_ID }, 1, {
      ...note,
      title: 'B',
      version: 2,
      updatedAt: '2026-09-28T11:00:00.000Z',
    });
    note = await repo.updateIfVersion({ userId: USER, id: NOTE_ID }, 2, {
      ...note,
      title: 'C',
      version: 3,
      updatedAt: '2026-09-28T12:00:00.000Z',
    });
    await repo.updateIfVersion({ userId: USER, id: NOTE_ID }, 3, {
      ...note,
      title: 'D',
      version: 4,
      updatedAt: '2026-09-28T13:00:00.000Z',
    });
    // Server is at version 4; client sends weak ETag for stale version 3.
    const routes = createFakeNoteRoutes(repo);
    const res = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/test-notes/${NOTE_ID}`,
        { title: 'stale' },
        { 'If-Match': 'W/"3"' },
      ),
      'PUT',
      `/api/notebook/test-notes/${NOTE_ID}`,
    );
    expect(res?.statusCode).toBe(412);
    const body = JSON.parse(res!.body as string);
    expect(body.error).toBe('precondition_failed');
    expect(body.currentVersion).toBe(4);
    expect(body.current).toMatchObject({
      id: NOTE_ID,
      title: 'D',
      version: 4,
    });
  });

  it('If-Match: * updates when the resource exists', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    const routes = createFakeNoteRoutes(repo);
    const res = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/test-notes/${NOTE_ID}`,
        { title: 'star' },
        { 'If-Match': '*' },
      ),
      'PUT',
      `/api/notebook/test-notes/${NOTE_ID}`,
    );
    expect(res?.statusCode).toBe(200);
    expect(res?.headers?.ETag).toBe('"2"');
    const body = JSON.parse(res!.body as string);
    expect(body).toMatchObject({ title: 'star', version: 2 });
  });

  it('If-Match: * on a missing resource returns 404', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(doc, TABLE);
    const routes = createFakeNoteRoutes(repo);
    const res = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/test-notes/${NOTE_ID}`,
        { title: 'nope' },
        { 'If-Match': '*' },
      ),
      'PUT',
      `/api/notebook/test-notes/${NOTE_ID}`,
    );
    expect(res?.statusCode).toBe(404);
  });

  it('malformed If-Match returns 400 (CHR-171)', async () => {
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(doc, TABLE);
    await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'A' }, '2026-09-28T10:00:00.000Z'),
    );
    const routes = createFakeNoteRoutes(repo);
    const res = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/test-notes/${NOTE_ID}`,
        { title: 'x' },
        { 'If-Match': 'abc' },
      ),
      'PUT',
      `/api/notebook/test-notes/${NOTE_ID}`,
    );
    expect(res?.statusCode).toBe(400);
    expect(JSON.parse(res!.body as string)).toMatchObject({
      error: 'bad_request',
      message: 'Invalid If-Match header',
    });
  });
});

describe('prod routes exclude fixture notes (CHR-153)', () => {
  it('routes table has sync but no fixture-notes paths', async () => {
    const { routes } = await import('../src/routes.js');
    const patterns = routes.map((r) => `${r.method} ${r.pattern}`);
    expect(patterns).toContain('GET /notebook/sync/changes');
    expect(patterns.some((p) => p.includes('fixture-notes'))).toBe(false);
  });
});

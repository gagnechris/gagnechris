import { beforeEach, describe, expect, it } from 'vitest';
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
} from './support/fake-note.js';

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

describe('sync feed (CHR-153)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerFakeNoteSync();
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
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T22:00:00.100Z',
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'late' },
        '2026-09-28T22:00:00.100Z',
      ),
    );

    // Second poll with since=nextSince: overlap (5s) still finds the write.
    now = '2026-09-28T22:00:03.000Z';
    const second = await ledger.queryChangesSince(USER, {
      since: first.nextSince,
    });
    expect(second.changes).toHaveLength(1);
    expect(second.changes[0]!.id).toBe(NOTE_ID);
    expect(second.changes[0]!.updatedAt).toBe('2026-09-28T22:00:00.100Z');
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

    await repo.updateIfVersion(NOTE_ID, 1, {
      ...created,
      title: 'B',
      version: 2,
      updatedAt: times[1]!,
    });

    await repo.softDelete(NOTE_ID, 2, {
      ...created,
      title: 'B',
      version: 3,
      updatedAt: times[2]!,
      deleted: true,
    });

    // One META row (not three ledger rows).
    const metaRows = [...store.values()].filter(
      (item) => item.entityType === FAKE_NOTE_CHANGE_TYPE,
    );
    expect(metaRows).toHaveLength(1);
    expect(metaRows[0]!.version).toBe(3);
    expect(metaRows[0]!.deleted).toBe(true);
    expect(metaRows[0]!.ttl).toEqual(expect.any(Number));
    expect(metaRows[0]!.syncPk).toBe(`SYNC#${USER}`);

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

  it('adding a synced entity is config on the base (no ledger/feed edits)', async () => {
    // registerFakeNoteSync + createFakeNotesRepo.sync is the only wiring.
    const { doc } = createMemoryDoc();
    const repo = createFakeNotesRepo(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    await repo.createIdempotent(
      buildFakeNote(USER, NOTE_ID, { title: 'via-config' }, '2026-09-28T10:00:00.000Z'),
    );

    const ledger = new SyncLedger(doc, TABLE, () => '2026-09-28T11:00:00.000Z');
    const routes = createSyncRoutes(ledger);
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
        buildFakeNote(USER, NOTE_ID, { title: 'B' }, '2026-09-28T10:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ name: 'ConflictError' });
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

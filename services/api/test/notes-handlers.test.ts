import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { registerProductionSyncAdapters } from '../src/sync/adapters.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createSyncRoutes } from '../src/sync/handlers.js';
import { SyncLedger } from '../src/sync/ledger.js';
import { createNotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';

const TABLE = 'gagnechris-notes-test';
const USER = 'user-notes-1';
const OTHER = 'user-notes-2';
const PAGE_ID = '01ARZ3NDEKTSV4RRFFQ48JMCZC';
const DAILY_ID = '01ARZ3NDEKTSV4RRFFQ48JMCZD';
const DAILY_ID_2 = '01ARZ3NDEKTSV4RRFFQ48JMCT0';

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

describe('notes handlers (CHR-40)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerProductionSyncAdapters();
  });

  it('creates, gets, updates with If-Match ETag, and lists by area', async () => {
    const { doc } = createMemoryDoc();
    const repo = createNotesRepository(doc, TABLE);
    const routes = createNoteRoutes(repo);

    const created = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/notes', {
        id: PAGE_ID,
        area: 'work',
        type: 'page',
        title: 'Ideas',
        bodyMarkdown: 'hello',
      }),
      'POST',
      '/api/notebook/notes',
    );
    expect(created?.statusCode).toBe(201);
    expect(created?.headers?.ETag).toBe('"1"');
    const createdBody = JSON.parse(created!.body as string);
    expect(createdBody).toMatchObject({
      id: PAGE_ID,
      type: 'page',
      date: null,
      title: 'Ideas',
    });

    const got = await dispatchRoutes(
      routes,
      adminEvent('GET', `/api/notebook/notes/${PAGE_ID}`),
      'GET',
      `/api/notebook/notes/${PAGE_ID}`,
    );
    expect(got?.statusCode).toBe(200);
    expect(got?.headers?.ETag).toBe('"1"');

    const conflict = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/notes/${PAGE_ID}`,
        { version: 1, title: 'stale' },
        { 'if-match': '"0"' },
      ),
      'PUT',
      `/api/notebook/notes/${PAGE_ID}`,
    );
    expect(conflict?.statusCode).toBe(412);

    const updated = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/notes/${PAGE_ID}`,
        { version: 1, title: 'Updated' },
        { 'if-match': '"1"' },
      ),
      'PUT',
      `/api/notebook/notes/${PAGE_ID}`,
    );
    expect(updated?.statusCode).toBe(200);
    expect(updated?.headers?.ETag).toBe('"2"');
    expect(JSON.parse(updated!.body as string).title).toBe('Updated');

    const listed = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/notes', undefined, undefined, {
        area: 'work',
        type: 'page',
      }),
      'GET',
      '/api/notebook/notes',
    );
    expect(listed?.statusCode).toBe(200);
    expect(JSON.parse(listed!.body as string).items).toHaveLength(1);
  });

  it('daily GET returns empty draft; PUT creates; create race loser gets daily_taken', async () => {
    const { doc } = createMemoryDoc();
    const repo = createNotesRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createNoteRoutes(repo);

    const empty = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/notes/daily/work/2026-10-02'),
      'GET',
      '/api/notebook/notes/daily/work/2026-10-02',
    );
    expect(empty?.statusCode).toBe(200);
    expect(JSON.parse(empty!.body as string)).toMatchObject({
      exists: false,
      area: 'work',
      date: '2026-10-02',
      version: 0,
    });

    const upsert = await dispatchRoutes(
      routes,
      adminEvent('PUT', '/api/notebook/notes/daily/work/2026-10-02', {
        id: DAILY_ID,
        title: 'Today',
        bodyMarkdown: '- [ ] ship',
      }),
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-02',
    );
    expect(upsert?.statusCode).toBe(200);
    expect(JSON.parse(upsert!.body as string).id).toBe(DAILY_ID);

    // The loser learns who won instead of silently getting the winner (CHR-187).
    await expect(
      repo.createFromRequest(USER, {
        id: DAILY_ID_2,
        area: 'work',
        type: 'daily',
        date: '2026-10-02',
        title: 'Other device',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      }),
    ).rejects.toMatchObject({
      code: 'daily_taken',
      currentVersion: 1,
      current: { id: DAILY_ID, title: 'Today' },
    });
  });

  it('cross-user GET is 404; soft-delete appears on sync feed as note', async () => {
    const { doc } = createMemoryDoc();
    const repo = createNotesRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = [
      ...createNoteRoutes(repo),
      ...createSyncRoutes(
        new SyncLedger(doc, TABLE, () => '2026-10-02T13:00:00.000Z'),
      ),
    ];

    await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/notes', {
        id: PAGE_ID,
        area: 'personal',
        type: 'page',
        title: 'Private',
      }),
      'POST',
      '/api/notebook/notes',
    );

    const other = await dispatchRoutes(
      routes,
      adminEvent(
        'GET',
        `/api/notebook/notes/${PAGE_ID}`,
        undefined,
        undefined,
        undefined,
        OTHER,
      ),
      'GET',
      `/api/notebook/notes/${PAGE_ID}`,
    );
    expect(other?.statusCode).toBe(404);

    const deleted = await dispatchRoutes(
      routes,
      adminEvent(
        'DELETE',
        `/api/notebook/notes/${PAGE_ID}`,
        { version: 1 },
        { 'if-match': '"1"' },
      ),
      'DELETE',
      `/api/notebook/notes/${PAGE_ID}`,
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
    expect(changes.some((c) => c.type === 'note')).toBe(true);
    expect(changes.find((c) => c.id === PAGE_ID)).toMatchObject({
      type: 'note',
      deleted: true,
    });
  });
});

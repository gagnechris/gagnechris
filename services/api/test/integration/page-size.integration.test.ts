import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { createSyncRoutes } from '../../src/sync/handlers.js';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { createTaskRoutes } from '../../src/tasks/handlers.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';
import { testUlid } from '../support/paging-corpus.js';

const USER = 'user-page-size';
const N = 100;
const BIG = 99_000;
const MAX_PAGE_BYTES = 1_500_000;

function bigText(i: number): string {
  return `${i} `.padEnd(BIG, 'x');
}

describe('list and sync page size (DynamoDB Local)', () => {
  let tableName: string;
  let routes: RouteDef[];
  const doc = createLocalDocClient();
  const noteIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('page-size');
    clearSyncEntities();
    registerProductionSyncAdapters();
    const notes = new NotesRepository(doc, tableName);
    const tasks = new TasksRepository(doc, tableName);
    routes = [
      ...createNoteRoutes(notes),
      ...createTaskRoutes(tasks, notes),
      ...createSyncRoutes(new SyncLedger(doc, tableName)),
    ];
    for (let i = 0; i < N; i += 1) {
      const noteId = testUlid('N', i);
      const taskId = testUlid('T', i);
      noteIds.push(noteId);
      taskIds.push(taskId);
      await notes.createFromRequest(USER, {
        id: noteId,
        area: i % 2 === 0 ? 'work' : 'personal',
        type: 'page',
        title: `note ${i}`,
        bodyMarkdown: bigText(i),
        tags: [],
        pinned: false,
      });
      await tasks.createFromRequest(USER, {
        id: taskId,
        area: i % 2 === 0 ? 'work' : 'personal',
        title: `task ${i}`,
        description: bigText(i),
        priority: 'med',
        status: (['todo', 'in_progress', 'done'] as const)[i % 3]!,
        dueDate: null,
        tags: [],
      });
    }
  }, 300_000);

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  /** Follows `nextCursor` to the end, checking every response's size. */
  async function walk(
    path: string,
    query: Record<string, string>,
    itemsKey: 'items' | 'changes',
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let pages = 1; pages <= 200; pages += 1) {
      const res = await dispatchRoutes(
        routes,
        makeEvent('GET', path, {
          query: { ...query, ...(cursor ? { cursor } : {}) },
          jwtClaims: { sub: USER },
        }),
        'GET',
        path,
      );
      expect(res.statusCode).toBe(200);
      const raw = res.body as string;
      expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(
        MAX_PAGE_BYTES,
      );
      // What Lambda measures: the proxy result with the body escaped again.
      expect(
        Buffer.byteLength(JSON.stringify(res), 'utf8'),
      ).toBeLessThanOrEqual(MAX_PAGE_BYTES);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const items = body[itemsKey] as Array<{ id: string }>;
      ids.push(...items.map((item) => item.id));
      cursor = body.nextCursor as string | undefined;
      if (!cursor) return { ids, pages };
    }
    throw new Error(`${path} paging did not terminate`);
  }

  function expectExactly(got: string[], expected: string[]) {
    expect(new Set(got).size).toBe(got.length);
    expect([...got].sort()).toEqual([...expected].sort());
  }

  it('notes list pages stay under the size cap and return every note', async () => {
    const all = await walk('/api/notebook/notes', { limit: '100' }, 'items');
    expectExactly(all.ids, noteIds);
    expect(all.pages).toBeGreaterThan(1);
    for (const area of ['work', 'personal']) {
      const one = await walk(
        '/api/notebook/notes',
        { limit: '100', area },
        'items',
      );
      expectExactly(
        one.ids,
        noteIds.filter((_, i) => (i % 2 === 0) === (area === 'work')),
      );
    }
  }, 120_000);

  it('tasks list pages stay under the size cap and return every task', async () => {
    const all = await walk('/api/notebook/tasks', { limit: '100' }, 'items');
    expectExactly(all.ids, taskIds);
    expect(all.pages).toBeGreaterThan(1);
  }, 120_000);

  it('sync pages stay under the size cap and return every change', async () => {
    const all = await walk(
      '/api/notebook/sync/changes',
      { limit: '100' },
      'changes',
    );
    expectExactly(all.ids, [...noteIds, ...taskIds]);
    expect(all.pages).toBeGreaterThan(1);
  }, 120_000);
});

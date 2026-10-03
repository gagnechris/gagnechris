/**
 * Multi-partition lists page completely (CHR-185), memory-doc version.
 * The DynamoDB Local twin lives in test/integration/list-paging.integration.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { TasksRepository, sortTasksForList } from '../src/tasks/repository.js';
import { createTaskRoutes } from '../src/tasks/handlers.js';
import { searchNotebook } from '../src/search/service.js';
import { NotesRepository } from '../src/notes/repository.js';
import {
  AREAS,
  PAGING_USER,
  PRIORITIES,
  STATUSES,
  corpusNote,
  corpusTask,
  expectExactIds,
  seedPagingCorpus,
  testUlid,
  walkRoute,
} from './support/paging-corpus.js';
import type { Task } from '@gagnechris/shared';

const TABLE = 'gagnechris-paging-test';
const N = 150;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('multi-partition list paging (CHR-185)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('notes page completely for every area/type filter', async () => {
    const { doc } = createMemoryDoc();
    const { routes } = await seedPagingCorpus(doc, TABLE, {
      notes: N,
      tasks: 0,
    });
    for (const area of [undefined, ...AREAS]) {
      for (const type of [undefined, 'daily', 'page'] as const) {
        for (const limit of ['7', '50']) {
          const got = await walkRoute(routes, '/api/notebook/notes', {
            limit,
            ...(area ? { area } : {}),
            ...(type ? { type } : {}),
          });
          const expected = range(N)
            .map(corpusNote)
            .filter(
              (n) => (!area || n.area === area) && (!type || n.type === type),
            )
            .map((n) => n.id);
          expectExactIds(got, expected);
        }
      }
    }
  });

  it('tasks page completely for every area/status/open/priority filter', async () => {
    const { doc } = createMemoryDoc();
    const { routes } = await seedPagingCorpus(doc, TABLE, {
      notes: 0,
      tasks: N,
    });
    for (const area of [undefined, ...AREAS]) {
      for (const status of [undefined, ...STATUSES]) {
        for (const open of [undefined, 'true'] as const) {
          for (const priority of [undefined, ...PRIORITIES]) {
            const got = await walkRoute(routes, '/api/notebook/tasks', {
              limit: '9',
              ...(area ? { area } : {}),
              ...(status ? { status } : {}),
              ...(open ? { open } : {}),
              ...(priority ? { priority } : {}),
            });
            const expected = range(N)
              .map(corpusTask)
              .filter(
                (t) =>
                  (!area || t.area === area) &&
                  (status
                    ? t.status === status
                    : !open || t.status !== 'done') &&
                  (!priority || t.priority === priority),
              )
              .map((t) => t.id);
            expectExactIds(got, expected);
          }
        }
      }
    }
  });

  it('rejects a foreign or malformed composite cursor with 400', async () => {
    const { doc } = createMemoryDoc();
    const { routes } = await seedPagingCorpus(doc, TABLE, {
      notes: 0,
      tasks: 20,
    });
    for (const cursor of ['mp.bm90LWpzb24', 'mp.eyJwIjo5OX0', 'garbage']) {
      const res = await dispatchRoutes(
        routes,
        makeEvent('GET', '/api/notebook/tasks', {
          query: { limit: '5', cursor },
          jwtClaims: { sub: PAGING_USER },
        }),
        'GET',
        '/api/notebook/tasks',
      );
      expect(res?.statusCode).toBe(400);
    }
  });

  it('120 done past-due tasks never bury 3 open tasks due today', async () => {
    const { doc } = createMemoryDoc();
    const repo = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = createTaskRoutes(repo);
    for (let i = 0; i < 120; i += 1) {
      await repo.createFromRequest(PAGING_USER, {
        id: testUlid('D', i),
        area: 'work',
        title: `old ${i}`,
        description: '',
        priority: 'high',
        status: 'done',
        dueDate: '2026-09-01',
        tags: [],
      });
    }
    for (let i = 0; i < 3; i += 1) {
      await repo.createFromRequest(PAGING_USER, {
        id: testUlid('P', i),
        area: i === 0 ? 'personal' : 'work',
        title: `today ${i}`,
        description: '',
        priority: 'low',
        status: 'todo',
        dueDate: '2026-10-02',
        tags: [],
      });
    }
    const res = await dispatchRoutes(
      routes,
      makeEvent('GET', '/api/notebook/tasks', {
        query: { open: 'true', today: '2026-10-02', limit: '50' },
        jwtClaims: { sub: PAGING_USER },
      }),
      'GET',
      '/api/notebook/tasks',
    );
    const body = JSON.parse(res!.body as string) as { items: Task[] };
    expect(body.items.map((t) => t.title).sort()).toEqual([
      'today 0',
      'today 1',
      'today 2',
    ]);
  });

  it("overdue ranking skips done tasks and uses the caller's day", () => {
    const base = {
      userId: 'u',
      area: 'work' as const,
      description: '',
      priority: 'med' as const,
      completedAt: null,
      noteId: null,
      tags: [],
      version: 1,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      deleted: false,
    };
    const items: Task[] = [
      {
        ...base,
        id: testUlid('S', 1),
        title: 'done past',
        status: 'done',
        dueDate: '2026-09-01',
      },
      {
        ...base,
        id: testUlid('S', 2),
        title: 'due local today',
        status: 'todo',
        dueDate: '2026-10-02',
      },
      {
        ...base,
        id: testUlid('S', 3),
        title: 'open past',
        status: 'todo',
        dueDate: '2026-09-30',
      },
    ];
    // At 8pm in New York it is already 2026-10-03 in UTC; the local day wins.
    expect(sortTasksForList(items, '2026-10-02').map((t) => t.title)).toEqual([
      'open past',
      'done past',
      'due local today',
    ]);
  });

  it('search finds both the oldest and the newest item in a 600-item corpus', async () => {
    const { doc } = createMemoryDoc();
    const notes = new NotesRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const tasks = new TasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    for (let i = 0; i < 600; i += 1) {
      await notes.createFromRequest(PAGING_USER, {
        id: testUlid('Q', i),
        area: i % 2 === 0 ? 'work' : 'personal',
        type: 'page',
        title:
          i === 0 ? 'zebra oldest' : i === 599 ? 'yak newest' : `filler ${i}`,
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });
    }
    for (const q of ['zebra', 'yak']) {
      const result = await searchNotebook(PAGING_USER, { q }, { notes, tasks });
      expect(result.notes).toHaveLength(1);
    }
  });
});

/**
 * Shared corpus + full-walk helpers for list paging tests (CHR-185).
 * Used by the memory-doc unit test and the DynamoDB Local integration test.
 */
import { expect } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { makeEvent } from './make-event.js';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { createNotesRepository } from '../../src/notes/repository.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { createTasksRepository } from '../../src/tasks/repository.js';
import { createTaskRoutes } from '../../src/tasks/handlers.js';

export const PAGING_USER = 'user-paging-1';
const AREAS = ['work', 'personal'] as const;
const STATUSES = ['todo', 'in_progress', 'done'] as const;
const PRIORITIES = ['low', 'med', 'high'] as const;

/** Deterministic Crockford ULID: fixed prefix + base32 counter. */
export function testUlid(prefix: string, n: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let s = '';
  let v = n;
  for (let i = 0; i < 6; i += 1) {
    s = alphabet[v % 32]! + s;
    v = Math.floor(v / 32);
  }
  return `01ARZ3NDEKTSV4RRFFQ${prefix}${s}`.slice(0, 26);
}

/** Unique calendar day per index so daily claims never collide. */
function dayFromIndex(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}

/** The corpus definition, for computing expected ids per filter. */
export function corpusNote(i: number) {
  return {
    id: testUlid('N', i),
    area: AREAS[i % 2]!,
    type: i % 3 === 0 ? ('daily' as const) : ('page' as const),
  };
}

export function corpusTask(i: number) {
  return {
    id: testUlid('T', i),
    area: AREAS[i % 2]!,
    priority: PRIORITIES[i % 3]!,
    status: STATUSES[Math.floor(i / 2) % 3]!,
  };
}

export async function seedPagingCorpus(
  doc: DynamoDBDocumentClient,
  table: string,
  counts = { notes: 150, tasks: 150 },
) {
  const notes = createNotesRepository(
    doc,
    table,
    () => '2026-10-02T12:00:00.000Z',
  );
  const tasks = createTasksRepository(
    doc,
    table,
    () => '2026-10-02T12:00:00.000Z',
  );
  for (let i = 0; i < counts.notes; i += 1) {
    const n = corpusNote(i);
    const daily = n.type === 'daily';
    await notes.createFromRequest(PAGING_USER, {
      id: n.id,
      area: n.area,
      type: n.type,
      ...(daily ? { date: dayFromIndex(i) } : {}),
      title: `note ${i}`,
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
  }
  for (let i = 0; i < counts.tasks; i += 1) {
    const t = corpusTask(i);
    await tasks.createFromRequest(PAGING_USER, {
      id: t.id,
      area: t.area,
      title: `task ${i}`,
      description: '',
      priority: t.priority,
      status: t.status,
      dueDate:
        i % 4 === 0 ? null : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      tags: [],
    });
  }
  return {
    routes: [...createNoteRoutes(notes), ...createTaskRoutes(tasks)],
    notes,
    tasks,
  };
}

/** Follow nextCursor through the HTTP route until exhausted. */
export async function walkRoute(
  routes: RouteDef[],
  path: string,
  query: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 500; guard += 1) {
    const res = await dispatchRoutes(
      routes,
      makeEvent('GET', path, {
        query: { ...query, ...(cursor ? { cursor } : {}) },
        jwtClaims: { sub: PAGING_USER },
      }),
      'GET',
      path,
    );
    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res!.body as string) as {
      items: Array<Record<string, unknown>>;
      nextCursor?: string;
    };
    expect(body.items.length).toBeLessThanOrEqual(Number(query.limit));
    all.push(...body.items);
    cursor = body.nextCursor;
    if (!cursor) return all;
  }
  throw new Error('paging did not terminate');
}

export function expectExactIds(
  items: Array<Record<string, unknown>>,
  expected: string[],
) {
  const ids = items.map((i) => i.id as string);
  expect(new Set(ids).size).toBe(ids.length); // no duplicates
  expect([...ids].sort()).toEqual([...expected].sort()); // no drops
}

export { AREAS, STATUSES, PRIORITIES };

import { expect } from 'vitest';
import type { Harness } from './harness.js';
import {
  corpusNote,
  corpusTask,
  dayFromIndex,
} from '../../support/paging-cases.js';
import { notebookUser } from './claims.js';

export {
  AREAS,
  CORPUS_TODAY,
  PRIORITIES,
  SCHEDULE_QUERIES,
  STATUSES,
  corpusNote,
  corpusTask,
  expectExactIds,
  testUlid,
} from '../../support/paging-cases.js';

export const PAGING_USER = 'user-paging-http';

export async function inBatches(
  count: number,
  make: (i: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < count; i += 20) {
    await Promise.all(
      Array.from({ length: Math.min(20, count - i) }, (_, j) => make(i + j)),
    );
  }
}

export async function create(
  h: Harness,
  user: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await h.api.request('POST', path, {
    claims: notebookUser(user),
    body,
  });
  expect(res.status, `POST ${path}: ${JSON.stringify(res.body)}`).toBe(201);
}

export async function seedPagingCorpus(
  h: Harness,
  counts: { notes: number; tasks: number },
): Promise<void> {
  await inBatches(counts.notes, async (i) => {
    const n = corpusNote(i);
    await create(h, PAGING_USER, '/api/notebook/notes', {
      id: n.id,
      area: n.area,
      type: n.type,
      ...(n.type === 'daily' ? { date: dayFromIndex(i) } : {}),
      title: `note ${i}`,
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
  });
  await inBatches(counts.tasks, async (i) => {
    const t = corpusTask(i);
    await create(h, PAGING_USER, '/api/notebook/tasks', {
      id: t.id,
      area: t.area,
      title: `task ${i}`,
      description: '',
      priority: t.priority,
      status: t.status,
      dueDate:
        i % 4 === 0 ? null : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      startDate: t.startDate,
      someday: t.someday,
      tags: [],
    });
  });
}

export async function walkRoute(
  h: Harness,
  path: string,
  query: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 500; guard += 1) {
    const res = await h.api.request<{
      items: Array<Record<string, unknown>>;
      nextCursor?: string;
    }>('GET', path, {
      claims: notebookUser(PAGING_USER),
      query: { ...query, ...(cursor ? { cursor } : {}) },
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(Number(query.limit));
    all.push(...res.body.items);
    cursor = res.body.nextCursor;
    if (!cursor) return all;
  }
  throw new Error('paging did not terminate');
}

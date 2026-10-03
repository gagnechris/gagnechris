import {
  buildDailyNoteClaimItem,
  buildHomeMetaItem,
  buildNoteMetaItem,
  buildResumeMetaItem,
  buildTaskMetaItem,
} from '@gagnechris/data';
import { DEFAULT_HOME, DEFAULT_RESUME } from '@gagnechris/shared';
import type { ScanFn, ScanPage } from '../src/validate.js';

export const USER = 'user-sub-1';
export const TS = '2026-10-01T12:00:00.000Z';

export function healthyItems(): Record<string, unknown>[] {
  const note = buildNoteMetaItem({
    id: '01NOTE',
    userId: USER,
    area: 'work',
    type: 'daily',
    date: '2026-10-01',
    title: 'Daily',
    bodyMarkdown: 'private text',
    tags: [],
    pinned: false,
    version: 3,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
  });
  const task = buildTaskMetaItem({
    id: '01TASK',
    userId: USER,
    area: 'work',
    title: 'Do it',
    description: '',
    priority: 'med',
    status: 'todo',
    dueDate: null,
    completedAt: null,
    noteId: '01NOTE',
    tags: [],
    version: 1,
    createdAt: TS,
    updatedAt: TS,
    deleted: false,
  });
  return [
    buildHomeMetaItem({ ...DEFAULT_HOME, updatedAt: TS, version: 1 }),
    buildResumeMetaItem({ ...DEFAULT_RESUME, updatedAt: TS, version: 1 }),
    note,
    task,
    buildDailyNoteClaimItem(USER, 'work', '2026-10-01', '01NOTE'),
    // Key-only rows (no schema rule): rate counter, slug claim.
    { pk: 'RATE#ses#global', sk: 'DAY#2026-10-01', count: 2 },
    { pk: 'SLUG#hello', sk: 'POST', entityType: 'slug', postId: 'p1' },
  ];
}

/** Scan fake that returns `items` in pages of `pageSize`. */
export function pagedScan(
  items: Record<string, unknown>[],
  pageSize = 3,
): ScanFn & { readonly calls: number } {
  const state = { calls: 0 };
  const scan: ScanFn = async (input) => {
    state.calls += 1;
    const start = input.ExclusiveStartKey
      ? Number(input.ExclusiveStartKey.offset)
      : 0;
    const slice = items.slice(start, start + pageSize);
    const next = start + pageSize;
    const page: ScanPage = { Items: slice };
    if (next < items.length) page.LastEvaluatedKey = { offset: next };
    return page;
  };
  const fn = Object.defineProperty(scan, 'calls', {
    get: () => state.calls,
  }) as ScanFn & { readonly calls: number };
  return fn;
}

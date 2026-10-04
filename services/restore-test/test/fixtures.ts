import {
  buildDailyNoteClaimItem,
  buildHomeMetaItem,
  buildNoteMetaItem,
  buildProjectMetaItem,
  buildProjectPublishedItem,
  buildResumeMetaItem,
  buildTaskMetaItem,
} from '@gagnechris/data';
import { DEFAULT_HOME, DEFAULT_RESUME, type Project } from '@gagnechris/shared';
import type { CountFn, ScanFn, ScanPage } from '../src/validate.js';

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
  const project: Project = {
    id: '01PROJECT',
    slug: 'notebook',
    name: 'Notebook',
    pitch: '',
    stage: 'building',
    stageNote: '',
    previewImage: null,
    bodyMarkdown: '',
    stack: [],
    links: [],
    demo: null,
    order: 0,
    href: null,
    status: 'published',
    publishedAt: TS,
    updatedAt: TS,
    version: 2,
    hasUnpublishedChanges: false,
  };
  return [
    buildHomeMetaItem({ ...DEFAULT_HOME, updatedAt: TS, version: 1 }),
    buildResumeMetaItem({ ...DEFAULT_RESUME, updatedAt: TS, version: 1 }),
    note,
    task,
    buildDailyNoteClaimItem(USER, 'work', '2026-10-01', '01NOTE'),
    // Key-only rows (no schema rule): rate counter, slug claim.
    { pk: 'RATE#ses#global', sk: 'DAY#2026-10-01', count: 2 },
    { pk: 'SLUG#hello', sk: 'POST', entityType: 'slug', postId: 'p1' },
    buildProjectMetaItem(project),
    buildProjectPublishedItem(project),
    {
      pk: 'PROJECT_SLUG#notebook',
      sk: 'PROJECT',
      entityType: 'projectSlug',
      projectId: '01PROJECT',
    },
  ];
}

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

export type CountCall = Parameters<CountFn>[0];

/** Evaluates the floor's COUNT filter in memory, one item per page. */
export function fakeCount(
  items: Record<string, unknown>[],
): CountFn & { readonly calls: CountCall[] } {
  const calls: CountCall[] = [];
  const count: CountFn = async (input) => {
    calls.push(input);
    const type = input.ExpressionAttributeValues[':t'];
    const cut = String(input.ExpressionAttributeValues[':cut']);
    const start = input.ExclusiveStartKey
      ? Number(input.ExclusiveStartKey.offset)
      : 0;
    const item = items[start];
    const at = (v: unknown) => typeof v === 'string' && v <= cut;
    const hit =
      item !== undefined &&
      item.entityType === type &&
      (at(item.createdAt) || at(item.updatedAt));
    return {
      Count: hit ? 1 : 0,
      ...(start + 1 < items.length
        ? { LastEvaluatedKey: { offset: start + 1 } }
        : {}),
    };
  };
  return Object.assign(count, { calls });
}

export function noteAt(id: string, ts: string): Record<string, unknown> {
  return buildNoteMetaItem({
    id,
    userId: USER,
    area: 'work',
    type: 'page',
    date: null,
    title: 'Page',
    bodyMarkdown: 'private text',
    tags: [],
    pinned: false,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    deleted: false,
  });
}

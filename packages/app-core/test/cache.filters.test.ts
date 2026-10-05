import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { setCachedNote, setCachedTask } from '../src/query/cache.js';
import { queryKeys } from '../src/query/keys.js';
import type { Note, Task } from '../src/query/api.js';

type Pages<T> = { pages: { items: T[] }[]; pageParams: unknown[] };

const note = (overrides: Partial<Note> = {}): Note => ({
  id: '01TESTFILTERNOTE0000000001',
  userId: 'u1',
  area: 'work',
  type: 'daily',
  date: '2026-10-09',
  title: '',
  bodyMarkdown: 'hello',
  tags: [],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  deleted: false,
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '01TESTFILTERTASK0000000001',
  userId: 'u1',
  area: 'work',
  title: 'Ship',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: '2026-10-09',
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  deleted: false,
  ...overrides,
});

const seed = <T>(qc: QueryClient, key: readonly unknown[], items: T[]) =>
  qc.setQueryData<Pages<T>>(key, {
    pages: [{ items }],
    pageParams: [undefined],
  });

const itemsOf = <T>(qc: QueryClient, key: readonly unknown[]) =>
  qc.getQueryData<Pages<T>>(key)?.pages.flatMap((p) => p.items) ?? [];

describe('setCachedNote respects list filters', () => {
  test('saving a daily note leaves the Pages list and other calendars alone', () => {
    const qc = new QueryClient();
    const pagesKey = queryKeys.notes.list({ area: 'work', type: 'page' });
    const allPagesKey = queryKeys.notes.list({ type: 'page' });
    const workDailyKey = queryKeys.notes.list({ area: 'work', type: 'daily' });
    const personalKey = queryKeys.notes.list({ area: 'personal' });
    const page = note({
      id: '01TESTFILTERPAGE0000000001',
      type: 'page',
      date: null,
    });
    seed(qc, pagesKey, [page]);
    seed(qc, allPagesKey, [page]);
    seed(qc, workDailyKey, []);
    seed(qc, personalKey, []);
    const workDates = queryKeys.notes.dailyDates(
      'work',
      '2026-10-01',
      '2026-10-31',
    );
    const personalDates = queryKeys.notes.dailyDates(
      'personal',
      '2026-10-01',
      '2026-10-31',
    );
    const allDates = queryKeys.notes.dailyDates(
      undefined,
      '2026-10-01',
      '2026-10-31',
    );
    const novDates = queryKeys.notes.dailyDates(
      'work',
      '2026-11-01',
      '2026-11-30',
    );
    for (const key of [workDates, personalDates, allDates, novDates]) {
      qc.setQueryData(key, new Set<string>());
    }

    setCachedNote(qc, note());

    expect(itemsOf<Note>(qc, pagesKey)).toEqual([page]);
    expect(itemsOf<Note>(qc, allPagesKey)).toEqual([page]);
    expect(itemsOf<Note>(qc, personalKey)).toEqual([]);
    expect(itemsOf<Note>(qc, workDailyKey).map((n) => n.id)).toEqual([
      '01TESTFILTERNOTE0000000001',
    ]);
    expect(qc.getQueryData(workDates)).toEqual(new Set(['2026-10-09']));
    expect(qc.getQueryData(allDates)).toEqual(new Set(['2026-10-09']));
    expect(qc.getQueryData(personalDates)).toEqual(new Set());
    expect(qc.getQueryData(novDates)).toEqual(new Set());
  });

  test('a date range only takes daily notes inside it', () => {
    const qc = new QueryClient();
    const octKey = queryKeys.notes.list({
      area: 'work',
      type: 'daily',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    seed(qc, octKey, []);

    setCachedNote(qc, note({ date: '2026-11-02' }));
    expect(itemsOf<Note>(qc, octKey)).toEqual([]);

    setCachedNote(qc, note({ id: '01TESTFILTERNOTE0000000002' }));
    expect(itemsOf<Note>(qc, octKey)).toHaveLength(1);
  });
});

describe('setCachedTask respects list filters', () => {
  test('a completed task leaves open lists and joins done lists', () => {
    const qc = new QueryClient();
    const openKey = queryKeys.tasks.list({
      area: 'work',
      open: true,
    } as Parameters<typeof queryKeys.tasks.list>[0]);
    const doneKey = queryKeys.tasks.list({ area: 'work', status: 'done' });
    const personalKey = queryKeys.tasks.list({ area: 'personal' });
    seed(qc, openKey, [task()]);
    seed(qc, doneKey, []);
    seed(qc, personalKey, []);

    setCachedTask(
      qc,
      task({
        status: 'done',
        completedAt: '2026-10-09T01:00:00.000Z',
        version: 2,
      }),
    );

    expect(itemsOf<Task>(qc, openKey)).toEqual([]);
    expect(itemsOf<Task>(qc, doneKey).map((t) => t.version)).toEqual([2]);
    expect(itemsOf<Task>(qc, personalKey)).toEqual([]);
  });

  test('due and note filters gate inserts', () => {
    const qc = new QueryClient();
    const dueOnKey = queryKeys.tasks.list({ dueOn: '2026-10-10' });
    const overdueKey = queryKeys.tasks.list({ dueBefore: '2026-10-10' });
    const noteKey = queryKeys.tasks.list({
      noteId: '01TESTFILTERNOTE0000000001',
    });
    seed(qc, dueOnKey, []);
    seed(qc, overdueKey, []);
    seed(qc, noteKey, []);

    setCachedTask(qc, task());

    expect(itemsOf<Task>(qc, dueOnKey)).toEqual([]);
    expect(itemsOf<Task>(qc, overdueKey)).toHaveLength(1);
    expect(itemsOf<Task>(qc, noteKey)).toEqual([]);
  });

  test('start-date and someday filters gate inserts', () => {
    const qc = new QueryClient();
    const todayKey = queryKeys.tasks.list({ startOnOrBefore: '2026-10-09' });
    const upcomingKey = queryKeys.tasks.list({ startAfter: '2026-10-09' });
    const onKey = queryKeys.tasks.list({ startOn: '2026-10-12' });
    const somedayKey = queryKeys.tasks.list({ someday: true });
    for (const key of [todayKey, upcomingKey, onKey, somedayKey]) {
      seed(qc, key, []);
    }

    setCachedTask(qc, task({ startDate: '2026-10-12' }));
    expect(itemsOf<Task>(qc, todayKey)).toEqual([]);
    expect(itemsOf<Task>(qc, upcomingKey)).toHaveLength(1);
    expect(itemsOf<Task>(qc, onKey)).toHaveLength(1);
    expect(itemsOf<Task>(qc, somedayKey)).toEqual([]);

    setCachedTask(qc, task({ startDate: null, someday: true, version: 2 }));
    expect(itemsOf<Task>(qc, todayKey)).toEqual([]);
    expect(itemsOf<Task>(qc, upcomingKey)).toEqual([]);
    expect(itemsOf<Task>(qc, somedayKey)).toHaveLength(1);

    setCachedTask(qc, task({ startDate: null, version: 3 }));
    expect(itemsOf<Task>(qc, todayKey)).toHaveLength(1);
    expect(itemsOf<Task>(qc, somedayKey)).toEqual([]);
  });
});

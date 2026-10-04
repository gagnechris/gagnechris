import { describe, expect, test } from 'vitest';
import type { Task } from '@gagnechris/shared';
import {
  bucketTodayTasks,
  showTomorrowPreview,
  todayProgress,
} from './todayTaskBuckets';

const base = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  userId: 'u1',
  area: 'work',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('bucketTodayTasks', () => {
  test('splits overdue, due today, in progress, done today, tomorrow', () => {
    const buckets = bucketTodayTasks(
      [
        base({ id: 'a', title: 'late', dueDate: '2026-10-01' }),
        base({ id: 'b', title: 'today', dueDate: '2026-10-02' }),
        base({
          id: 'c',
          title: 'wip',
          status: 'in_progress',
          dueDate: null,
        }),
        base({
          id: 'd',
          title: 'done',
          dueDate: '2026-10-02',
          status: 'done',
          completedAt: '2026-10-02T10:00:00.000Z',
        }),
        base({ id: 'e', title: 'tmr', dueDate: '2026-10-03' }),
      ],
      '2026-10-02',
    );

    expect(buckets.overdue.map((t) => t.id)).toEqual(['a']);
    expect(buckets.dueToday.map((t) => t.id)).toEqual(['b']);
    expect(buckets.inProgress.map((t) => t.id)).toEqual(['c']);
    expect(buckets.doneToday.map((t) => t.id)).toEqual(['d']);
    expect(buckets.tomorrow.map((t) => t.id)).toEqual(['e']);
    expect(todayProgress(buckets)).toEqual({ done: 1, total: 2 });
  });
});

describe('showTomorrowPreview', () => {
  test('is false before 18:00 and true at/after', () => {
    expect(showTomorrowPreview(new Date(2026, 9, 2, 17, 59))).toBe(false);
    expect(showTomorrowPreview(new Date(2026, 9, 2, 18, 0))).toBe(true);
  });
});

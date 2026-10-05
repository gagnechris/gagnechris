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
  startDate: null,
  someday: false,
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
  test('splits carried over, today, in progress, done today, tomorrow', () => {
    const buckets = bucketTodayTasks(
      [
        base({ id: 'a', title: 'late', startDate: '2026-10-01' }),
        base({ id: 'b', title: 'today', startDate: '2026-10-02' }),
        base({
          id: 'c',
          title: 'wip',
          status: 'in_progress',
          startDate: null,
        }),
        base({
          id: 'd',
          title: 'done',
          startDate: '2026-10-02',
          status: 'done',
          completedAt: '2026-10-02T10:00:00.000Z',
        }),
        base({ id: 'e', title: 'tmr', startDate: '2026-10-03' }),
        base({ id: 'f', title: 'now', startDate: null }),
        base({ id: 'g', title: 'later', someday: true }),
        base({ id: 'h', title: 'next week', startDate: '2026-10-09' }),
      ],
      '2026-10-02',
    );

    expect(buckets.carriedOver.map((t) => t.id)).toEqual(['a']);
    expect(buckets.startsToday.map((t) => t.id)).toEqual(['b', 'f']);
    expect(buckets.inProgress.map((t) => t.id)).toEqual(['c']);
    expect(buckets.doneToday.map((t) => t.id)).toEqual(['d']);
    expect(buckets.tomorrow.map((t) => t.id)).toEqual(['e']);
    expect(todayProgress(buckets)).toEqual({ done: 1, total: 3 });
  });
});

describe('showTomorrowPreview', () => {
  test('is false before 18:00 and true at/after', () => {
    expect(showTomorrowPreview(new Date(2026, 9, 2, 17, 59))).toBe(false);
    expect(showTomorrowPreview(new Date(2026, 9, 2, 18, 0))).toBe(true);
  });
});

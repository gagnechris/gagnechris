import { describe, expect, it } from 'vitest';
import { sortTasksForList } from './task-list-order.js';

const TODAY = '2026-10-01';
const task = (
  id: string,
  fields: Partial<{
    status: 'todo' | 'in_progress' | 'done' | 'dropped';
    priority: 'low' | 'med' | 'high';
    startDate: string | null;
    someday: boolean;
    dueDate: string | null;
  }> = {},
) => ({
  id,
  status: 'todo' as const,
  priority: 'med' as const,
  startDate: null,
  someday: false,
  dueDate: null,
  ...fields,
});

describe('sortTasksForList', () => {
  it('puts overdue and due-today tasks before tasks shown later', () => {
    const order = sortTasksForList(
      [
        task('tomorrow', { startDate: '2026-10-02' }),
        task('due-today', { dueDate: TODAY }),
        task('overdue', { dueDate: '2026-09-30' }),
      ],
      TODAY,
    ).map((t) => t.id);
    expect(order).toEqual(['overdue', 'due-today', 'tomorrow']);
  });

  it('orders the rest by show-on date, then undated, then Someday', () => {
    const order = sortTasksForList(
      [
        task('someday', { someday: true }),
        task('undated-low', { priority: 'low' }),
        task('undated-high', { priority: 'high' }),
        task('later', { startDate: '2026-10-09', dueDate: '2026-10-20' }),
        task('earlier', { startDate: '2026-09-28' }),
        task('done-overdue', { status: 'done', dueDate: '2026-09-01' }),
      ],
      TODAY,
    ).map((t) => t.id);
    expect(order).toEqual([
      'earlier',
      'later',
      'undated-high',
      'done-overdue',
      'undated-low',
      'someday',
    ]);
  });
});

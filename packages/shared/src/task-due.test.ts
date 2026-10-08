import { describe, expect, test } from 'vitest';
import { taskDue } from './task-due.js';

// 2026-10-02 is a Friday.
const FRI = '2026-10-02';
const open = (dueDate: string | null) => ({ dueDate, status: 'todo' as const });

describe('taskDue', () => {
  test('names the weekday within a week, else the date', () => {
    expect(taskDue(open('2026-10-08'), FRI)?.text).toBe('due Thu');
    expect(taskDue(open('2026-10-30'), FRI)?.text).toBe('due Oct 30');
    expect(taskDue(open(FRI), FRI)?.text).toBe('due today');
  });

  test('says Overdue in words once the day has passed', () => {
    expect(taskDue(open('2026-09-28'), FRI)).toEqual({
      text: 'Overdue · Mon',
      title: 'Overdue, was due Mon, Sep 28',
      overdue: true,
    });
    expect(taskDue(open('2026-09-20'), FRI)?.text).toBe('Overdue · Sep 20');
  });

  test('nothing for no deadline or a closed task', () => {
    expect(taskDue(open(null), FRI)).toBeNull();
    expect(taskDue({ dueDate: '2026-09-28', status: 'done' }, FRI)).toBeNull();
  });
});

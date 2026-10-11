import { describe, expect, it } from 'vitest';
import { taskMatchesSchedule } from './task-schedule.js';
import {
  matchesTaskShowOn,
  TASK_SHOW_ON_FILTERS,
  taskShowOnParam,
  taskShowOnQuery,
} from './task-show-on.js';

// Thursday.
const TODAY = '2026-10-01';
const task = (startDate: string | null, someday = false) => ({
  startDate,
  someday,
});

describe('matchesTaskShowOn', () => {
  it('splits dated tasks around today', () => {
    expect(matchesTaskShowOn(task('2026-09-30'), 'earlier', TODAY)).toBe(true);
    expect(matchesTaskShowOn(task(TODAY), 'today', TODAY)).toBe(true);
    expect(matchesTaskShowOn(task('2026-10-02'), 'later', TODAY)).toBe(true);
    expect(matchesTaskShowOn(task(TODAY), 'later', TODAY)).toBe(false);
  });

  it('ends This week on Saturday', () => {
    expect(matchesTaskShowOn(task('2026-10-03'), 'week', TODAY)).toBe(true);
    expect(matchesTaskShowOn(task('2026-10-04'), 'week', TODAY)).toBe(false);
  });

  it('keeps Someday out of every dated filter', () => {
    const parked = task('2026-10-02', true);
    expect(matchesTaskShowOn(parked, 'someday', TODAY)).toBe(true);
    expect(matchesTaskShowOn(parked, 'later', TODAY)).toBe(false);
    expect(matchesTaskShowOn(task(null), 'none', TODAY)).toBe(true);
    expect(matchesTaskShowOn(parked, '', TODAY)).toBe(true);
  });

  it('reads unknown params as Any', () => {
    expect(taskShowOnParam('week')).toBe('week');
    expect(taskShowOnParam('soon')).toBe('');
    expect(taskShowOnParam(null)).toBe('');
  });
});

describe('taskShowOnQuery', () => {
  it('asks the server for exactly what each filter shows', () => {
    const tasks = [
      task(null),
      task(null, true),
      ...['2026-09-27', '2026-09-30', TODAY, '2026-10-02', '2026-10-03'].map(
        (day) => task(day),
      ),
      task('2026-10-04'),
      task('2027-01-01'),
    ];
    for (const showOn of TASK_SHOW_ON_FILTERS) {
      const query = taskShowOnQuery(showOn, TODAY);
      for (const t of tasks) {
        expect(taskMatchesSchedule(t, query), `${showOn} ${t.startDate}`).toBe(
          matchesTaskShowOn(t, showOn, TODAY),
        );
      }
    }
  });
});

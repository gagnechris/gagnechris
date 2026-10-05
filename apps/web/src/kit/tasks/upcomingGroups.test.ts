import { describe, expect, test } from 'vitest';
import type { Task } from '@gagnechris/shared';
import { groupUpcomingTasks, noteChipLabel } from './upcomingGroups';

const task = (
  id: string,
  overrides: Partial<Task> = {},
): Pick<
  Task,
  'id' | 'version' | 'deleted' | 'status' | 'startDate' | 'someday' | 'title'
> => ({
  id,
  title: id,
  version: 1,
  deleted: false,
  status: 'todo',
  startDate: null,
  someday: false,
  ...overrides,
});

const FRI = '2026-10-02';

describe('groupUpcomingTasks', () => {
  test('puts each open future or parked task in exactly one group, in order', () => {
    const groups = groupUpcomingTasks(
      [
        task('later-b', { startDate: '2026-10-20' }),
        task('sat', { startDate: '2026-10-03' }),
        task('mon', { startDate: '2026-10-05' }),
        task('thu', { startDate: '2026-10-08' }),
        task('later-a', { startDate: '2026-10-09' }),
        task('parked', { someday: true }),
        task('today', { startDate: FRI }),
        task('no-date'),
        task('done', { startDate: '2026-10-03', status: 'done' }),
        task('dropped', { someday: true, status: 'dropped' }),
        task('deleted', { startDate: '2026-10-03', deleted: true }),
        // The same task twice (two lists mid-refetch): the newest copy wins.
        task('moved', { startDate: '2026-10-03', version: 1 }),
        task('moved', { startDate: '2026-10-05', version: 2 }),
      ],
      FRI,
    );
    expect(
      groups.map((g) => [g.label, g.sub, g.tasks.map((t) => t.id)]),
    ).toEqual([
      ['Tomorrow', 'Sat, Oct 3', ['sat']],
      ['Monday', 'Oct 5', ['mon', 'moved']],
      ['Thursday', 'Oct 8', ['thu']],
      ['Later', 'Oct 9 and beyond', ['later-a', 'later-b']],
      ['Someday', 'Parked, no date', ['parked']],
    ]);
    expect(groups.find((g) => g.key === 'later')?.datedRows).toBe(true);
  });

  test('returns nothing when nothing is scheduled', () => {
    expect(groupUpcomingTasks([task('a')], FRI)).toEqual([]);
  });
});

describe('noteChipLabel', () => {
  test('names a daily note by its day and a page by its title', () => {
    expect(
      noteChipLabel({ id: 'n', type: 'daily', date: FRI, title: '' }),
    ).toBe('Fri, Oct 2 note');
    expect(
      noteChipLabel({ id: 'n', type: 'page', date: null, title: ' Ideas ' }),
    ).toBe('Ideas');
    expect(
      noteChipLabel({ id: 'n', type: 'page', date: null, title: '' }),
    ).toBe('Untitled note');
  });
});

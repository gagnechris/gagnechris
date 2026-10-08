import { describe, expect, test } from 'vitest';
import type { Task } from './schemas.js';
import {
  bucketTodayTasks,
  comingUpDayLabel,
  comingUpWindow,
  snoozeBaseDay,
  stillOpenSource,
} from './today-task-buckets.js';

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

const FRI = '2026-10-02';

describe('bucketTodayTasks', () => {
  test('overdue tasks sort first in Still open, earliest deadline first', () => {
    const { stillOpen } = bucketTodayTasks(
      [
        base({ id: 'old', title: 'a', startDate: '2026-09-20' }),
        base({ id: 'due-today', title: 'b', dueDate: FRI }),
        base({ id: 'late', title: 'c', dueDate: '2026-10-01' }),
        base({ id: 'later', title: 'd', dueDate: '2026-10-09' }),
        base({ id: 'very-late', title: 'e', dueDate: '2026-09-25' }),
      ],
      { day: FRI, embeddedIds: new Set() },
    );
    expect(stillOpen.map((t) => t.id)).toEqual([
      'very-late',
      'late',
      'old',
      'due-today',
      'later',
    ]);
  });

  test('each task lands in exactly one place: the note, Still open, or Coming up', () => {
    const tasks = [
      // Embedded in today's note and due today.
      base({ id: 'note-due', title: 'a', startDate: FRI, dueDate: FRI }),
      // Embedded in today's note and scheduled later.
      base({ id: 'note-later', title: 'b', startDate: '2026-10-06' }),
      // Scheduled today, not in the note.
      base({ id: 'sched-today', title: 'c', startDate: FRI }),
      // Carried from yesterday's note.
      base({
        id: 'carried',
        title: 'd',
        noteId: 'thu-note',
        createdAt: '2026-10-01T15:00:00.000Z',
      }),
      // Scheduled a week ago.
      base({ id: 'sched-past', title: 'e', startDate: '2026-09-28' }),
      base({ id: 'tomorrow', title: 'f', startDate: '2026-10-03' }),
      base({ id: 'monday', title: 'g', startDate: '2026-10-05' }),
      base({ id: 'far', title: 'h', startDate: '2026-11-30' }),
      base({ id: 'someday', title: 'i', someday: true }),
      base({ id: 'done', title: 'j', status: 'done', startDate: FRI }),
      base({ id: 'dropped', title: 'k', status: 'dropped' }),
      base({ id: 'deleted', title: 'l', deleted: true }),
    ];
    // The same task from both lists (mid-refetch) counts once, newest copy.
    const all = [
      ...tasks,
      base({ id: 'carried', title: 'd', version: 0, noteId: 'thu-note' }),
    ];
    const embeddedIds = new Set(['note-due', 'note-later', 'gone']);

    const buckets = bucketTodayTasks(all, { day: FRI, embeddedIds });

    const places = [
      ...buckets.inNote.map((t) => t.id),
      ...buckets.stillOpen.map((t) => t.id),
      ...buckets.comingUp.flatMap((d) => d.tasks.map((t) => t.id)),
    ];
    expect(new Set(places).size).toBe(places.length);
    expect(buckets.inNote.map((t) => t.id).sort()).toEqual([
      'note-due',
      'note-later',
    ]);
    expect(buckets.stillOpen.map((t) => t.id)).toEqual([
      'sched-past',
      'carried',
      'sched-today',
    ]);
    expect(buckets.comingUp).toEqual([
      {
        date: '2026-10-03',
        tasks: [expect.objectContaining({ id: 'tomorrow' })],
      },
      {
        date: '2026-10-05',
        tasks: [expect.objectContaining({ id: 'monday' })],
      },
    ]);
    expect(buckets.stillOpen.find((t) => t.id === 'carried')?.version).toBe(1);
    // note-due and the three Still open rows show today, so they carry.
    expect(buckets.carryCount).toBe(4);
  });

  test('an @mon task is absent from Still open until Monday, then shows there', () => {
    const task = base({ id: 'mon', title: 'Ask Sam', startDate: '2026-10-05' });
    const none = new Set<string>();
    for (const day of ['2026-10-02', '2026-10-03', '2026-10-04']) {
      const b = bucketTodayTasks([task], { day, embeddedIds: none });
      expect(b.stillOpen).toEqual([]);
      expect(b.comingUp.map((d) => d.date)).toEqual(['2026-10-05']);
    }
    const monday = bucketTodayTasks([task], {
      day: '2026-10-05',
      embeddedIds: none,
    });
    expect(monday.stillOpen.map((t) => t.id)).toEqual(['mon']);
    expect(stillOpenSource(task, '2026-10-06').label).toBe('Scheduled Oct 5');
  });

  test('Coming up stops at the horizon', () => {
    const tasks = [
      base({ id: 'd14', title: 'a', startDate: '2026-10-16' }),
      base({ id: 'd15', title: 'b', startDate: '2026-10-17' }),
    ];
    const b = bucketTodayTasks(tasks, { day: FRI, embeddedIds: new Set() });
    expect(b.comingUp.map((d) => d.date)).toEqual(['2026-10-16']);
  });
});

describe('stillOpenSource', () => {
  const task = base({
    id: 't',
    title: 'Draft spec',
    noteId: 'n1',
    createdAt: '2026-09-30T15:00:00.000Z',
  });

  test('names the home daily note and how long ago', () => {
    expect(
      stillOpenSource(task, FRI, {
        id: 'n1',
        type: 'daily',
        date: '2026-09-30',
        title: '',
      }),
    ).toEqual({ label: 'Wed note · 2 days', noteId: 'n1' });
    expect(
      stillOpenSource(task, FRI, {
        id: 'n1',
        type: 'daily',
        date: '2026-09-12',
        title: '',
      }).label,
    ).toBe('Sep 12 note · 20 days');
  });

  test('a page note by title, and a note that has not loaded yet', () => {
    expect(
      stillOpenSource(task, FRI, {
        id: 'n1',
        type: 'page',
        date: null,
        title: 'Mobile ideas',
      }).label,
    ).toBe('Mobile ideas · 2 days');
    expect(stillOpenSource(task, FRI).label).toBe('Note · 2 days');
  });

  test('scheduled tasks say when, and keep their home note link', () => {
    expect(stillOpenSource({ ...task, startDate: '2026-09-28' }, FRI)).toEqual({
      label: 'Scheduled Sep 28',
      noteId: 'n1',
    });
    expect(stillOpenSource({ ...task, startDate: FRI }, FRI).label).toBe(
      'Scheduled Oct 2',
    );
  });

  test('a task written outside a note', () => {
    expect(stillOpenSource({ ...task, noteId: null }, FRI)).toEqual({
      label: 'Added Wed · 2 days',
      noteId: null,
    });
  });
});

test('comingUpDayLabel marks tomorrow', () => {
  expect(comingUpDayLabel('2026-10-03', FRI)).toBe('Tomorrow · Sat, Oct 3');
  expect(comingUpDayLabel('2026-10-05', FRI)).toBe('Mon, Oct 5');
});

test('snoozeBaseDay counts from the later of the page day and today', () => {
  expect(snoozeBaseDay('2026-09-30', FRI)).toBe(FRI);
  expect(snoozeBaseDay('2026-10-09', FRI)).toBe('2026-10-09');
});

describe('comingUpWindow', () => {
  test('names the default horizon as before, and others by their length', () => {
    expect(comingUpWindow()).toBe('the next two weeks');
    expect(comingUpWindow(7)).toBe('the next week');
    expect(comingUpWindow(1)).toBe('the next day');
    expect(comingUpWindow(10)).toBe('the next 10 days');
  });
});

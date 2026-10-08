import { describe, expect, test } from 'vitest';
import {
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  noteTitle,
  type ListNote,
} from './note-list-sections.js';
import { taskEmbedToken } from './task-embeds.js';

const FRI = '2026-10-02';

const note = (id: string, overrides: Partial<ListNote>): ListNote => ({
  id,
  type: 'page',
  date: null,
  title: id,
  bodyMarkdown: '',
  pinned: false,
  updatedAt: '2026-10-02T14:00:00.000Z',
  area: 'work',
  ...overrides,
});

describe('noteSections', () => {
  test('pinned first, then the last seven days, then earlier; newest first', () => {
    const sections = noteSections(
      [
        note('old-page', { updatedAt: '2026-09-20T14:00:00.000Z' }),
        note('pinned-old', {
          pinned: true,
          updatedAt: '2026-08-01T14:00:00.000Z',
        }),
        note('thu', { type: 'daily', date: '2026-10-01' }),
        note('fri', { type: 'daily', date: FRI }),
        note('sat-last-week', { type: 'daily', date: '2026-09-26' }),
        note('fri-last-week', { type: 'daily', date: '2026-09-25' }),
      ],
      FRI,
    );
    expect(sections.map((s) => [s.label, s.notes.map((n) => n.id)])).toEqual([
      ['Pinned', ['pinned-old']],
      ['This week', ['fri', 'thu', 'sat-last-week']],
      ['Earlier', ['fri-last-week', 'old-page']],
    ]);
  });

  test('a cached row without timestamps sorts last instead of throwing', () => {
    const partial = {
      ...note('partial', {}),
      updatedAt: undefined,
    } as unknown as ListNote;
    const sections = noteSections(
      [partial, note('fri', { type: 'daily', date: FRI })],
      FRI,
    );
    expect(sections.flatMap((s) => s.notes.map((n) => n.id))).toEqual([
      'fri',
      'partial',
    ]);
  });
});

describe('note row text', () => {
  test('daily notes are named by their day; pages by title', () => {
    expect(noteTitle(note('a', { type: 'daily', date: FRI }))).toBe(
      'Friday, Oct 2',
    );
    expect(noteTitle(note('a', { title: '  ' }))).toBe('Untitled');
  });

  test('day labels: Today, a weekday this week, else the date', () => {
    expect(noteDayLabel(FRI, FRI)).toBe('Today');
    expect(noteDayLabel('2026-09-28', FRI)).toBe('Mon');
    expect(noteDayLabel('2026-09-25', FRI)).toBe('Sep 25');
    expect(noteDayLabel('2025-12-30', FRI)).toBe('Dec 30, 2025');
  });

  test('the first line skips embeds and markdown markers', () => {
    expect(
      noteFirstLine(
        '{{task:01ARZ3NDEKTSV4RRFFQ69G5FAV}}\n\n## **Standup**\nmore',
      ),
    ).toBe('Standup');
    expect(noteFirstLine('- [ ] buy milk')).toBe('buy milk');
    expect(noteFirstLine('')).toBe('');
  });
});

describe('noteOpenTaskCount', () => {
  const [a, b, c] = [
    '01J9Z3A0000000000000000001',
    '01J9Z3A0000000000000000002',
    '01J9Z3A0000000000000000003',
  ];
  const body = ['Plan', '', ...[a, b, c].map(taskEmbedToken)].join('\n');

  test('counts the embedded tasks that are still open', () => {
    expect(noteOpenTaskCount(body, new Set([a, c, 'other']))).toBe(2);
    expect(noteOpenTaskCount(body, new Set())).toBe(0);
  });

  test('is 0 until the open list has loaded in full', () => {
    expect(noteOpenTaskCount(body, null)).toBe(0);
  });
});

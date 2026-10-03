import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { setCachedNote } from '../src/query/cache.js';
import { queryKeys } from '../src/query/keys.js';
import type { Note } from '../src/query/api.js';

const baseNote = (overrides: Partial<Note> = {}): Note => ({
  id: '01TESTCACHEDNOTE00000000001',
  userId: 'u1',
  area: 'work',
  type: 'daily',
  date: '2026-10-09',
  title: '',
  bodyMarkdown: 'hello',
  tags: [],
  pinned: false,
  version: 1,
  createdAt: '2026-10-09T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('setCachedNote with calendar dates', () => {
  test('does not throw when daily-dates Set is cached alongside lists', () => {
    const queryClient = new QueryClient();
    const datesKey = queryKeys.notes.dailyDates(
      'work',
      '2026-10-01',
      '2026-10-31',
    );
    queryClient.setQueryData(datesKey, new Set<string>(['2026-10-02']));

    const note = baseNote();
    expect(() => setCachedNote(queryClient, note)).not.toThrow();

    expect(
      queryClient.getQueryData<Note>(
        queryKeys.notes.daily('work', '2026-10-09'),
      ),
    ).toMatchObject({
      version: 1,
      bodyMarkdown: 'hello',
    });
    expect(queryClient.getQueryData<Set<string>>(datesKey)).toEqual(
      new Set(['2026-10-02', '2026-10-09']),
    );
  });

  test('skips non-infinite list cache entries without throwing', () => {
    const queryClient = new QueryClient();
    const listKey = queryKeys.notes.list({
      area: 'work',
      type: 'daily',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    // A non-list shape under a list key must not make the save throw.
    queryClient.setQueryData(listKey, new Set<string>(['2026-10-02']));

    expect(() => setCachedNote(queryClient, baseNote())).not.toThrow();
    expect(queryClient.getQueryData(listKey)).toEqual(new Set(['2026-10-02']));
  });

  test('still upserts infinite list pages', () => {
    const queryClient = new QueryClient();
    const listKey = queryKeys.notes.list({ area: 'work' });
    queryClient.setQueryData(listKey, {
      pages: [{ items: [] }],
      pageParams: [undefined],
    });

    setCachedNote(queryClient, baseNote({ type: 'page', date: null }));

    const data = queryClient.getQueryData<{
      pages: { items: Note[] }[];
    }>(listKey);
    expect(data?.pages[0]?.items).toHaveLength(1);
    expect(data?.pages[0]?.items[0]?.id).toBe('01TESTCACHEDNOTE00000000001');
  });
});

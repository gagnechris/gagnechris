import { queryKeys } from '@gagnechris/app-core';
import type { QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_AGE_MS,
  CACHE_SCHEMA_VERSION,
  cacheBuster,
  createAppQueryClient,
  isPersistedQueryKey,
} from './policy';

describe('what the cache persists', () => {
  it.each<[string, QueryKey]>([
    ['the notes list', queryKeys.notes.list()],
    ['a filtered notes list', queryKeys.notes.list({ area: 'work' })],
    ['a note', queryKeys.notes.detail('n1')],
    ["a day's note", queryKeys.notes.daily('work', '2026-10-07')],
    ['a batch of notes', queryKeys.notes.batch(['n1', 'n2'])],
    ['the tasks list', queryKeys.tasks.list({ open: true })],
    ['a task', queryKeys.tasks.detail('t1')],
  ])('persists %s', (_label, key) => {
    expect(isPersistedQueryKey(key)).toBe(true);
  });

  it.each<[string, QueryKey]>([
    ['search', queryKeys.search({ q: 'term' })],
    [
      'a notes list filtered by a search term',
      queryKeys.notes.list({ q: 'term' }),
    ],
    ['daily note dates', queryKeys.notes.dailyDates('work', 'a', 'b')],
    ['admin posts', queryKeys.posts.list()],
    ['health', ['health']],
  ])('does not persist %s', (_label, key) => {
    expect(isPersistedQueryKey(key)).toBe(false);
  });

  it('keys the cache by schema version and user', () => {
    expect(cacheBuster('sub-1')).toBe(`${CACHE_SCHEMA_VERSION}:sub-1`);
    expect(CACHE_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('keeps persisted queries in memory as long as the cache', () => {
    const client = createAppQueryClient();
    expect(client.getQueryDefaults(queryKeys.notes.detail('n1')).gcTime).toBe(
      CACHE_MAX_AGE_MS,
    );
    expect(client.getQueryDefaults(queryKeys.tasks.list()).gcTime).toBe(
      CACHE_MAX_AGE_MS,
    );
    expect(
      client.getQueryDefaults(queryKeys.search({ q: 'x' })).gcTime,
    ).toBeUndefined();
  });
});

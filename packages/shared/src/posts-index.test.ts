import { describe, expect, it } from 'vitest';
import { formatPostShortDate } from './post-date.js';
import { selectHomeRecentPosts } from './home-html.js';
import {
  comparePostsNewestFirst,
  groupPostsByYear,
  postsYearId,
} from './posts-index.js';

const post = (slug: string, publishedAt: string | null) => ({
  id: slug,
  slug,
  publishedAt,
  updatedAt: '2020-01-01T00:00:00.000Z',
});

describe('groupPostsByYear', () => {
  it('puts years newest first and posts newest first within each year', () => {
    const groups = groupPostsByYear([
      post('2024-mid', '2024-06-01T00:00:00.000Z'),
      post('2026-early', '2026-01-05T00:00:00.000Z'),
      post('2025-late', '2025-12-31T23:59:59.000Z'),
      post('2026-late', '2026-09-28T09:00:00.000Z'),
      post('2025-early', '2025-01-01T00:00:00.000Z'),
      post('2026-mid', '2026-02-01T00:00:00.000Z'),
    ]);
    expect(
      groups.map(({ year, posts }) => [year, posts.map((p) => p.slug)]),
    ).toEqual([
      ['2026', ['2026-late', '2026-mid', '2026-early']],
      ['2025', ['2025-late', '2025-early']],
      ['2024', ['2024-mid']],
    ]);
  });

  it('uses the UTC year, like the dates shown', () => {
    expect(
      groupPostsByYear([post('nye', '2025-12-31T23:30:00.000-05:00')]).map(
        (g) => g.year,
      ),
    ).toEqual(['2026']);
  });

  it('keeps undated posts, last, and leaves the input alone', () => {
    const input = [
      post('none', null),
      post('bad', 'not a date'),
      post('dated', '2026-02-01T00:00:00.000Z'),
    ];
    const groups = groupPostsByYear(input);
    expect(groups.map((g) => [g.year, g.posts.map((p) => p.slug)])).toEqual([
      ['2026', ['dated']],
      ['Undated', ['none', 'bad']],
    ]);
    expect(input.map((p) => p.slug)).toEqual(['none', 'bad', 'dated']);
    expect(postsYearId('Undated')).toBe('posts-undated');
  });

  it('is empty for no posts', () => {
    expect(groupPostsByYear([])).toEqual([]);
  });
});

describe('comparePostsNewestFirst', () => {
  it('orders /posts like posts.json and Home: newest, then id on a tie', () => {
    const at = '2026-02-01T00:00:00.000Z';
    const input = [
      { ...post('b', at), excerpt: '', title: 'b' },
      { ...post('a', at), excerpt: '', title: 'a' },
      { ...post('newer', '2026-03-01T00:00:00.000Z'), excerpt: '', title: 'n' },
    ];
    const expected = ['newer', 'a', 'b'];
    expect([...input].sort(comparePostsNewestFirst).map((p) => p.id)).toEqual(
      expected,
    );
    expect(groupPostsByYear(input)[0]!.posts.map((p) => p.id)).toEqual(
      expected,
    );
    expect(selectHomeRecentPosts(input).map((p) => p.id)).toEqual(expected);
  });

  it('compares instants, not strings, across UTC offsets', () => {
    // 23:00Z, though it sorts after the other as text.
    const offset = post('offset', '2026-02-01T01:00:00.000+02:00');
    const newer = post('newer', '2026-01-31T23:30:00.000Z');
    expect([offset, newer].sort(comparePostsNewestFirst)[0]!.id).toBe('newer');
  });
});

describe('formatPostShortDate', () => {
  it('prints month and day in UTC', () => {
    expect(formatPostShortDate('2026-02-01T00:00:00.000Z')).toBe('Feb 1');
    expect(formatPostShortDate('2026-02-01')).toBe('Feb 1');
    expect(formatPostShortDate('2026-09-28T23:59:00.000-04:00')).toBe('Sep 29');
    expect(formatPostShortDate(null)).toBe('');
    expect(formatPostShortDate('nope')).toBe('');
  });
});

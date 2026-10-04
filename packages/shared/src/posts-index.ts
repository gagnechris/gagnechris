export const POSTS_INDEX_INTRO =
  'Ideas, lessons and experiments from software engineering, leadership and AI.';

export const POSTS_INDEX_EMPTY_TEXT = 'No posts yet. Check back soon!';

export const POSTS_RSS_LINK = {
  label: 'Subscribe via RSS',
  href: '/rss.xml',
} as const;

export const UNDATED_POSTS_LABEL = 'Undated';

export const postsYearId = (year: string): string =>
  `posts-${year.toLowerCase()}`;

export type PostsYearGroup<T> = { year: string; posts: T[] };

const time = (iso: string | null | undefined): number => {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

/**
 * Newest year first and newest post first within it (UTC, like the dates
 * shown). Posts without a usable date go last, under "Undated".
 */
export const groupPostsByYear = <T extends { publishedAt: string | null }>(
  posts: readonly T[],
): PostsYearGroup<T>[] => {
  const groups = new Map<string, T[]>();
  const sorted = [...posts].sort((a, b) => {
    const [ta, tb] = [time(a.publishedAt), time(b.publishedAt)];
    return ta === tb ? 0 : tb > ta ? 1 : -1;
  });
  for (const post of sorted) {
    const ms = time(post.publishedAt);
    const year = Number.isFinite(ms)
      ? String(new Date(ms).getUTCFullYear())
      : UNDATED_POSTS_LABEL;
    const group = groups.get(year);
    if (group) group.push(post);
    else groups.set(year, [post]);
  }
  return [...groups].map(([year, items]) => ({ year, posts: items }));
};

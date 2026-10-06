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

type DatedPost = {
  id: string;
  publishedAt: string | null;
  updatedAt?: string;
};

const time = (iso: string | null | undefined): number => {
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
};

/**
 * Newest first by `publishedAt` (else `updatedAt`), then id: the one order of
 * `posts.json`, RSS, the sitemap, Home and `/posts`.
 */
export const comparePostsNewestFirst = (a: DatedPost, b: DatedPost): number => {
  const ta = time(a.publishedAt ?? a.updatedAt);
  const tb = time(b.publishedAt ?? b.updatedAt);
  return tb > ta ? 1 : tb < ta ? -1 : a.id.localeCompare(b.id);
};

const publishedYear = (iso: string | null): string => {
  const ms = time(iso);
  return Number.isFinite(ms)
    ? String(new Date(ms).getUTCFullYear())
    : UNDATED_POSTS_LABEL;
};

/**
 * Newest year first and newest post first within it (UTC, like the dates
 * shown). Posts without a usable date go last, under "Undated".
 */
export const groupPostsByYear = <T extends DatedPost>(
  posts: readonly T[],
): PostsYearGroup<T>[] => {
  const groups = new Map<string, T[]>();
  for (const post of [...posts].sort(comparePostsNewestFirst)) {
    const year = publishedYear(post.publishedAt);
    const group = groups.get(year);
    if (group) group.push(post);
    else groups.set(year, [post]);
  }
  const undated = groups.get(UNDATED_POSTS_LABEL);
  groups.delete(UNDATED_POSTS_LABEL);
  if (undated) groups.set(UNDATED_POSTS_LABEL, undated);
  return [...groups].map(([year, items]) => ({ year, posts: items }));
};

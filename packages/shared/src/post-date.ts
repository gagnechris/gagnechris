const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
};

/**
 * Calendar day (YYYY-MM-DD) for a publish timestamp, always in UTC so
 * `2026-02-01T00:00:00.000Z` stays February 1 for every visitor timezone.
 */
export const postDateAttribute = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

/**
 * Human-readable publish date in UTC. Shared by BlogIndex, BlogPost, and
 * publisher prerender so client and static HTML always agree.
 */
export const formatPostDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', DATE_FORMAT);
};

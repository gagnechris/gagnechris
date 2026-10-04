const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
};

/** UTC so `2026-02-01T00:00:00.000Z` stays February 1 in every visitor timezone. */
export const postDateAttribute = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

/** UTC so client and prerendered static HTML always agree. */
export const formatPostDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', DATE_FORMAT);
};

const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
};

/** "Feb 1": the year is shown by the group the post sits in. */
export const formatPostShortDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', SHORT_DATE_FORMAT);
};

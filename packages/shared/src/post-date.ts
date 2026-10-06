import { MONTH_LONG, MONTH_SHORT } from './calendar.js';

const parse = (iso: string): Date | null => {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** UTC so `2026-02-01T00:00:00.000Z` stays February 1 in every visitor timezone. */
export const postDateAttribute = (iso: string | null | undefined): string => {
  const parsed = iso ? parse(iso) : null;
  return parsed ? parsed.toISOString().slice(0, 10) : '';
};

/** "February 1, 2026"; UTC so client and prerendered static HTML always agree. */
export const formatPostDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const parsed = parse(iso);
  if (!parsed) return iso;
  return `${MONTH_LONG[parsed.getUTCMonth()]} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
};

/** "Feb 1": the year is shown by the group the post sits in. */
export const formatPostShortDate = (iso: string | null | undefined): string => {
  const parsed = iso ? parse(iso) : null;
  return parsed
    ? `${MONTH_SHORT[parsed.getUTCMonth()]} ${parsed.getUTCDate()}`
    : '';
};

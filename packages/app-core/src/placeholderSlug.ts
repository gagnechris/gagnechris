import { EMPTY_SLUG_FALLBACK } from '@gagnechris/shared';

/** New drafts get a throwaway slug so two of them can't collide on create; the editor keeps it following the title. */
export const newPlaceholderSlug = (prefix: 'untitled' | 'untitled-project') =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export const isPlaceholderSlug = (slug: string): boolean =>
  /^untitled(?:-project)?(?:-[a-z0-9]{6})?$/.test(slug) ||
  slug === EMPTY_SLUG_FALLBACK;

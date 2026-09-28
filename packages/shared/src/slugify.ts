/**
 * URL-safe slug from a title. Empty input → empty string (caller chooses fallback).
 * Cap must stay ≤ CloudFront `isValidBlogSlug` (CHR-123 / CHR-145).
 */
export const MAX_SLUG_LENGTH = 120;

export const slugify = (input: string): string => {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
};

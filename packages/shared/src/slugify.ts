/**
 * URL-safe slug from a title. Empty input → empty string (caller chooses fallback).
 */
export const slugify = (input: string): string => {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
};

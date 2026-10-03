/** Cap must stay ≤ CloudFront `isValidBlogSlug`. */
export const MAX_SLUG_LENGTH = 120;

export const EMPTY_SLUG_FALLBACK = 'untitled';

export const slugify = (input: string): string => {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);
  // Truncation can leave a trailing `-`.
  return slug.replace(/-+$/g, '');
};

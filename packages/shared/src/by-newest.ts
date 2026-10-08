/**
 * Newest first for ISO timestamps. Mutation responses are upserted into list
 * caches, so a row may arrive without its timestamps; it sorts last.
 */
export const byNewest = (a?: string | null, b?: string | null): number =>
  (b ?? '').localeCompare(a ?? '');

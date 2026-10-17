import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import type { Selection, TextEdit } from '../notebook/toolbarEdits';

/** An uploaded image goes in as its own paragraph, replacing any selection. */
export function insertImage(
  text: string,
  { start, end }: Selection,
  alt: string,
  path: string,
): TextEdit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const newlines = (run: RegExp, s: string) => run.exec(s)![0].length;
  const gap = (have: number) => '\n'.repeat(Math.max(0, 2 - have));
  const lead = before === '' ? '' : gap(newlines(/\n*$/, before));
  const trail = gap(newlines(/^\n*/, after));
  const image = `![${alt.replace(/[[\]]/g, '')}](${path})`;
  const caret = before.length + lead.length + image.length + trail.length;
  return {
    text: before + lead + image + trail + after,
    selection: { start: caret, end: caret },
  };
}

/**
 * Where `selection`, taken in `before`, sits in `after`: moved by an edit
 * before it, kept by one after it, and past the new text of one that overlaps
 * it, so nothing typed meanwhile is replaced.
 */
export function followSelection(
  before: string,
  after: string,
  { start, end }: Selection,
): Selection {
  const shorter = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shorter && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  if (end <= prefix) return { start, end };
  const delta = after.length - before.length;
  if (start >= before.length - suffix) {
    return { start: start + delta, end: end + delta };
  }
  const caret = after.length - suffix;
  return { start: caret, end: caret };
}

/** With `followSlug`, the slug tracks `key` until it is edited by hand. */
export const withSlugSource = <T extends { slug: string }>(
  draft: T,
  key: Exclude<keyof T, 'slug'>,
  value: string,
  followSlug: boolean,
): T => ({
  ...draft,
  [key]: value,
  ...(followSlug ? { slug: slugify(value) || EMPTY_SLUG_FALLBACK } : {}),
});

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

import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import type { PostDraftFields } from '@gagnechris/app-core';
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

/** With `followSlug`, the slug tracks the title until it is edited by hand. */
export const withTitle = (
  draft: PostDraftFields,
  title: string,
  followSlug: boolean,
): PostDraftFields =>
  followSlug
    ? { ...draft, title, slug: slugify(title) || EMPTY_SLUG_FALLBACK }
    : { ...draft, title };

import { findTaskEmbeds } from './task-embeds.js';

/** Zero-based line numbers, inclusive. */
export type LineBlock = { first: number; last: number };

const ITEM = /^[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\{\{task:)/;

const indentOf = (text: string) => /^[ \t]*/.exec(text)![0].length;
const blank = (text: string) => text.trim().length === 0;

/** The item at `n` and the lines indented under it, as the web editor moves them. */
export function markdownItemBlock(
  lines: readonly string[],
  n: number,
): LineBlock {
  const head = lines[n]!;
  if (!ITEM.test(head)) return { first: n, last: n };
  const base = indentOf(head);
  let last = n;
  while (last + 1 < lines.length) {
    const next = lines[last + 1]!;
    if (blank(next) || indentOf(next) <= base) break;
    last += 1;
  }
  return { first: n, last };
}

/** The line of the embed for `taskId`; null when the note no longer has it. */
export const taskEmbedLineOf = (markdown: string, taskId: string) =>
  findTaskEmbeds(markdown).find((e) => e.id === taskId)?.line ?? null;

/** Takes the task's block out of the note, keeping its tasks. */
export function removeTaskBlock(markdown: string, taskId: string): string {
  const lines = markdown.split('\n');
  const line = taskEmbedLineOf(markdown, taskId);
  if (line === null) return markdown;
  const { first, last } = markdownItemBlock(lines, line);
  return [...lines.slice(0, first), ...lines.slice(last + 1)].join('\n');
}

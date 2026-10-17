import { indentWidth } from './indent-width.js';
import { fenceLineKind, scanFences } from './markdown-fences.js';
import {
  findTaskEmbeds,
  taskEmbedNesting,
  type TaskEmbedNesting,
} from './task-embeds.js';

/** Zero-based line numbers, inclusive. */
export type LineBlock = { first: number; last: number };

export type NoteHeading = { line: number; title: string };

/** Spaces one nesting level adds to a task's lines. */
export const TASK_NEST_WIDTH = 2;

const ITEM = /^[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\{\{task:)/;
const SECTION_HEADING = /^##[ \t]+(.+?)[ \t#]*$/;

const blank = (text: string) => text.trim().length === 0;

/** A list item, checklist item or task embed: a line that carries the lines under it. */
export const isMarkdownItem = (text: string) => ITEM.test(text);

/** The item at `n` and the lines indented under it, as the editors move them. */
export function markdownItemBlock(
  lines: readonly string[],
  n: number,
): LineBlock {
  const head = lines[n]!;
  if (!ITEM.test(head)) return { first: n, last: n };
  const base = indentWidth(head);
  let last = n;
  while (last + 1 < lines.length) {
    const next = lines[last + 1]!;
    if (blank(next) || indentWidth(next) <= base) break;
    last += 1;
  }
  return { first: n, last };
}

/**
 * The line after the outermost item block holding line `n`. A line added
 * inside that block would take the lines below from the task they sit under;
 * a blank line ends a block, so the walk up stops at one.
 */
export function lineAfterOuterBlock(
  lines: readonly string[],
  n: number,
): number {
  let top = n;
  for (let k = n - 1; k >= 0 && indentWidth(lines[top]!) > 0; k -= 1) {
    const text = lines[k]!;
    if (blank(text)) break;
    if (
      indentWidth(text) < indentWidth(lines[top]!) &&
      markdownItemBlock(lines, k).last >= n
    ) {
      top = k;
    }
  }
  return markdownItemBlock(lines, top).last + 1;
}

/**
 * Text that starts a new line at the end of the task row at `n` goes on new
 * lines after the row's outer block (one leading line break is the one that
 * starts it). Returns the lines and where the inserted text ends.
 */
export function insertAfterTaskBlock(
  lines: readonly string[],
  n: number,
  text: string,
): { lines: string[]; line: number; column: number } {
  const added = text.replace(/^\r?\n/, '').split(/\r?\n/);
  const at = lineAfterOuterBlock(lines, n);
  return {
    lines: [...lines.slice(0, at), ...added, ...lines.slice(at)],
    line: at + added.length - 1,
    column: added[added.length - 1]!.length,
  };
}

/** The note's `##` headings outside code fences. */
export function noteHeadings(lines: readonly string[]): NoteHeading[] {
  const fences = scanFences(lines);
  const headings: NoteHeading[] = [];
  lines.forEach((text, line) => {
    if (fenceLineKind(fences, line)) return;
    const match = SECTION_HEADING.exec(text);
    if (match) headings.push({ line, title: match[1]! });
  });
  return headings;
}

/**
 * The line after the last text in the section under `heading` (null: above
 * the first heading), skipping `block`.
 */
export function sectionEnd(
  lines: readonly string[],
  headings: readonly NoteHeading[],
  heading: NoteHeading | null,
  block: LineBlock,
): number {
  const start = heading ? heading.line + 1 : 0;
  const next = headings.find((h) => h.line > (heading?.line ?? -1));
  const end = next ? next.line - 1 : lines.length - 1;
  for (let n = end; n >= start; n -= 1) {
    if (n >= block.first && n <= block.last) continue;
    if (!blank(lines[n]!)) return n + 1;
  }
  return start;
}

/** Adds `delta` spaces to each line, or takes up to `-delta` of its indent. */
export function reindent(text: string, delta: number): string {
  if (delta === 0) return text;
  return text
    .split('\n')
    .map((line) => {
      if (delta > 0) return line.trim() ? ' '.repeat(delta) + line : line;
      return line.slice(Math.min(indentWidth(line), -delta));
    })
    .join('\n');
}

const taskLineAt = (
  lines: readonly string[],
  n: number,
): TaskEmbedNesting | undefined =>
  taskEmbedNesting(lines.join('\n')).find((e) => e.line === n);

/**
 * Whether the block of the line at `n` holds task lines of its own: nesting
 * it would put them two levels down, where they have no parent.
 */
const holdsTasks = (lines: readonly string[], n: number) => {
  const { last } = markdownItemBlock(lines, n);
  return findTaskEmbeds(lines.join('\n')).some(
    (e) => e.line > n && e.line <= last,
  );
};

/**
 * The indent that makes the task at `n` a subtask of the task above it at
 * its level. Null unless that line is a task not under another task, since
 * subtasks are one level deep, and null when the task has subtasks.
 */
export function taskNestIndent(
  lines: readonly string[],
  n: number,
): number | null {
  if (holdsTasks(lines, n)) return null;
  const indent = indentWidth(lines[n]!);
  let above = n - 1;
  while (above >= 0 && indentWidth(lines[above]!) > indent) {
    if (blank(lines[above]!)) return null;
    above -= 1;
  }
  if (above < 0 || indentWidth(lines[above]!) !== indent) return null;
  const task = taskLineAt(lines, above);
  return task && !task.nested ? indent + TASK_NEST_WIDTH : null;
}

/**
 * The indent the task at `moved`, dropped right under line `above`, takes
 * when nested: a subtask of a top-level task, or a sibling of a subtask. Null
 * when `above` is not a task line, or when the moved task has subtasks.
 */
export function taskDropNestIndent(
  lines: readonly string[],
  above: number,
  moved: number,
): number | null {
  if (holdsTasks(lines, moved)) return null;
  const task = above >= 0 ? taskLineAt(lines, above) : undefined;
  if (!task) return null;
  const indent = indentWidth(lines[above]!);
  return task.nested ? indent : indent + TASK_NEST_WIDTH;
}

/**
 * Takes out the line at `n`. The lines under it move out to its level, so a
 * removed parent's subtasks don't nest under the task above instead.
 */
export function removeTaskLine(lines: readonly string[], n: number): string[] {
  const { last } = markdownItemBlock(lines, n);
  const under = lines.slice(n + 1, last + 1);
  const step =
    under.length > 0 ? indentWidth(under[0]!) - indentWidth(lines[n]!) : 0;
  return [
    ...lines.slice(0, n),
    ...under.map((line) => reindent(line, -step)),
    ...lines.slice(last + 1),
  ];
}

/** Takes out each line that embeds one of `ids`, as `removeTaskLine` does. */
export function removeTaskEmbedLines(
  markdown: string,
  ids: ReadonlySet<string>,
): string {
  const drop = findTaskEmbeds(markdown)
    .filter((e) => ids.has(e.id))
    .map((e) => e.line);
  if (drop.length === 0) return markdown;
  let lines = markdown.split('\n');
  // Bottom up, so each line number still points at its line.
  for (const n of drop.reverse()) lines = removeTaskLine(lines, n);
  return lines.join('\n');
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

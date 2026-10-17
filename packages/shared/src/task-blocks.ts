import { indentWidth } from './indent-width.js';
import { fenceLineKind, scanFences } from './markdown-fences.js';
import {
  findTaskEmbeds,
  removeTaskEmbedLines,
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
 * The indent that makes the task at `n` a subtask of the task above it at
 * its level. Null unless that line is a task not under another task, since
 * subtasks are one level deep.
 */
export function taskNestIndent(
  lines: readonly string[],
  n: number,
): number | null {
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
 * The indent a task dropped right under line `above` takes when nested: a
 * subtask of a top-level task, or a sibling of a subtask. Null when `above`
 * is not a task line.
 */
export function taskDropNestIndent(
  lines: readonly string[],
  above: number,
): number | null {
  const task = above >= 0 ? taskLineAt(lines, above) : undefined;
  if (!task) return null;
  const indent = indentWidth(lines[above]!);
  return task.nested ? indent : indent + TASK_NEST_WIDTH;
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

/**
 * The note with a task's block (`block` starts with the task's line) moved
 * into it: after its text, or, when the note already embeds the task, the
 * lines it lacks under that task's line. Tasks the note already embeds are
 * left out. Null when the note already holds every line.
 */
export function addMovedTaskBlock(
  markdown: string,
  taskId: string,
  block: string,
): string | null {
  const present = new Set(findTaskEmbeds(markdown).map((e) => e.id));
  const at = taskEmbedLineOf(markdown, taskId);
  if (at === null) {
    const body = markdown.replace(/\s+$/, '');
    const moved = removeTaskEmbedLines(block, present);
    return `${body}${body ? '\n\n' : ''}${moved}\n\n`;
  }
  const lines = markdown.split('\n');
  const { first, last } = markdownItemBlock(lines, at);
  const have = new Map<string, number>();
  for (let n = first + 1; n <= last; n += 1) {
    const key = lines[n]!.trim();
    have.set(key, (have.get(key) ?? 0) + 1);
  }
  const [head = '', ...under] = block.split('\n');
  const missing = removeTaskEmbedLines(under.join('\n'), present)
    .split('\n')
    .filter((line) => {
      const key = line.trim();
      if (!key) return false;
      const count = have.get(key) ?? 0;
      if (count > 0) have.set(key, count - 1);
      return count === 0;
    });
  if (missing.length === 0) return null;
  const added = reindent(
    missing.join('\n'),
    indentWidth(lines[at]!) - indentWidth(head),
  );
  return [...lines.slice(0, last + 1), added, ...lines.slice(last + 1)].join(
    '\n',
  );
}

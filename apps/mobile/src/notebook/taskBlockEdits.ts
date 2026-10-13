import { fenceLineKind, findTaskEmbeds, scanFences } from '@gagnechris/shared';

/** Zero-based line numbers, inclusive. */
export type LineBlock = { first: number; last: number };

export type NoteHeading = { line: number; title: string };

const ITEM = /^[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\{\{task:)/;
const SECTION_HEADING = /^##[ \t]+(.+?)[ \t#]*$/;
const NEST = 2;

const indentOf = (text: string) => /^[ \t]*/.exec(text)![0].length;
const blank = (text: string) => text.trim().length === 0;

/** The item at `n` and the lines indented under it, as the web editor moves them. */
export function blockAt(lines: readonly string[], n: number): LineBlock {
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

/** The line of the embed for `taskId`; null when the note no longer has it. */
export const embedLine = (markdown: string, taskId: string) =>
  findTaskEmbeds(markdown).find((e) => e.id === taskId)?.line ?? null;

const reindent = (rows: readonly string[], delta: number) =>
  rows.map((row) => {
    if (delta > 0) return row.trim() ? ' '.repeat(delta) + row : row;
    return row.slice(Math.min(indentOf(row), -delta));
  });

/**
 * Indent nests the task, with its lines, under the task above it at its
 * level; Outdent takes it out a level. Null when it can't.
 */
export function indentTaskBlock(
  markdown: string,
  taskId: string,
  dir: 'in' | 'out',
): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return null;
  const indent = indentOf(lines[line]!);
  if (dir === 'in') {
    let above = line - 1;
    while (above >= 0 && indentOf(lines[above]!) > indent) {
      if (blank(lines[above]!)) return null;
      above -= 1;
    }
    if (above < 0 || indentOf(lines[above]!) !== indent) return null;
    if (!findTaskEmbeds(lines[above]!).length) return null;
  } else if (indent === 0) {
    return null;
  }
  const { first, last } = blockAt(lines, line);
  const rows = reindent(
    lines.slice(first, last + 1),
    dir === 'in' ? NEST : -NEST,
  );
  return [...lines.slice(0, first), ...rows, ...lines.slice(last + 1)].join(
    '\n',
  );
}

/** The line after the last text in the section under `heading`, skipping `block`. */
function sectionEnd(
  lines: readonly string[],
  headings: readonly NoteHeading[],
  heading: NoteHeading,
  block: LineBlock,
): number {
  const start = heading.line + 1;
  const next = headings.find((h) => h.line > heading.line);
  const end = next ? next.line - 1 : lines.length - 1;
  for (let n = end; n >= start; n -= 1) {
    if (n >= block.first && n <= block.last) continue;
    if (!blank(lines[n]!)) return n + 1;
  }
  return start;
}

/** Puts the task's block last in the section under the `index`th `##` heading. */
export function moveTaskBlockToSection(
  markdown: string,
  taskId: string,
  index: number,
): string | null {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  const headings = noteHeadings(lines);
  const heading = headings[index];
  if (line === null || !heading) return null;
  const block = blockAt(lines, line);
  const before = sectionEnd(lines, headings, heading, block);
  if (before >= block.first && before <= block.last + 1) return null;
  const rows = lines.slice(block.first, block.last + 1);
  const rest = [...lines.slice(0, block.first), ...lines.slice(block.last + 1)];
  const at = before > block.last ? before - rows.length : before;
  return [...rest.slice(0, at), ...rows, ...rest.slice(at)].join('\n');
}

/**
 * The task's line and the lines under it, with the row's own indent taken
 * off, for another note.
 */
export function taskBlockLines(markdown: string, taskId: string) {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return null;
  const { first, last } = blockAt(lines, line);
  return reindent(lines.slice(first, last + 1), -indentOf(lines[line]!)).join(
    '\n',
  );
}

/** Takes the task's block out of the note, keeping its tasks. */
export function removeTaskBlock(markdown: string, taskId: string): string {
  const lines = markdown.split('\n');
  const line = embedLine(markdown, taskId);
  if (line === null) return markdown;
  const { first, last } = blockAt(lines, line);
  return [...lines.slice(0, first), ...lines.slice(last + 1)].join('\n');
}

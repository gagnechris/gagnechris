import {
  ChangeSet,
  EditorSelection,
  type EditorState,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import { fenceLineKind, scanFences } from '@gagnechris/shared';
import { blockEnd } from './lineMoves';

/** Line numbers, one-based and inclusive. */
export type LineBlock = { first: number; last: number };

export type NoteHeading = { line: number; title: string };

const SECTION_HEADING = /^##[ \t]+(.+?)[ \t#]*$/;

/** The note's `##` headings outside code fences. */
export function noteHeadings(doc: Text): NoteHeading[] {
  const fences = scanFences(doc.iterLines());
  const headings: NoteHeading[] = [];
  for (let n = 1; n <= doc.lines; n += 1) {
    if (fenceLineKind(fences, n - 1)) continue;
    const match = SECTION_HEADING.exec(doc.line(n).text);
    if (match) headings.push({ line: n, title: match[1]! });
  }
  return headings;
}

/** The line at `n` and the lines indented under it. */
export const blockAt = (doc: Text, n: number): LineBlock => ({
  first: n,
  last: blockEnd(doc, n),
});

/** The heading of the section `line` is in; null above the first heading. */
export function sectionOf(
  headings: readonly NoteHeading[],
  line: number,
): NoteHeading | null {
  let found: NoteHeading | null = null;
  for (const h of headings) {
    if (h.line >= line) break;
    found = h;
  }
  return found;
}

const isBlank = (doc: Text, n: number) => doc.line(n).text.trim() === '';

/**
 * Moves the block so it starts at line `before`, or to the end of the note
 * when `before` is past the last line. Null when it would not move.
 */
export function moveBlock(
  state: EditorState,
  block: LineBlock,
  before: number,
  userEvent: string,
): TransactionSpec | null {
  const { doc } = state;
  const { first, last } = block;
  if (before >= first && before <= last + 1) return null;
  if (first === 1 && last === doc.lines) return null;
  const text = doc.sliceString(doc.line(first).from, doc.line(last).to);
  const remove =
    last < doc.lines
      ? { from: doc.line(first).from, to: doc.line(last + 1).from }
      : { from: doc.line(first - 1).to, to: doc.line(last).to };
  const atEnd = before > doc.lines;
  const at = atEnd ? doc.line(doc.lines).to : doc.line(before).from;
  const insert = { from: at, insert: atEnd ? `\n${text}` : `${text}\n` };
  const changes = ChangeSet.of(
    at < remove.from ? [insert, remove] : [remove, insert],
    doc.length,
  );

  const oldStart = doc.line(first).from;
  const oldEnd = doc.line(last).to;
  const newStart = changes.mapPos(at, -1) + (atEnd ? 1 : 0);
  const map = (pos: number) =>
    pos >= oldStart && pos <= oldEnd
      ? newStart + (pos - oldStart)
      : changes.mapPos(pos);
  const selection = EditorSelection.create(
    state.selection.ranges.map((r) =>
      EditorSelection.range(map(r.anchor), map(r.head)),
    ),
    state.selection.mainIndex,
  );
  return { changes, selection, scrollIntoView: true, userEvent };
}

/** The line after the last text in the section under `heading`, skipping `block`. */
function sectionEnd(
  doc: Text,
  headings: readonly NoteHeading[],
  heading: NoteHeading | null,
  block: LineBlock,
): number {
  const start = heading ? heading.line + 1 : 1;
  const next = headings.find((h) => h.line > (heading?.line ?? 0));
  const end = next ? next.line - 1 : doc.lines;
  for (let n = end; n >= start; n -= 1) {
    if (n >= block.first && n <= block.last) continue;
    if (!isBlank(doc, n)) return n + 1;
  }
  return start;
}

/** Puts the block last in the section under `heading`. */
export function moveBlockToSection(
  state: EditorState,
  block: LineBlock,
  heading: NoteHeading,
  userEvent = 'move.section',
): TransactionSpec | null {
  const headings = noteHeadings(state.doc);
  return moveBlock(
    state,
    block,
    sectionEnd(state.doc, headings, heading, block),
    userEvent,
  );
}

/**
 * ⌥⇧↓ puts the block first in the next section; ⌥⇧↑ puts it last in the one
 * before its own.
 */
export function jumpSection(
  state: EditorState,
  block: LineBlock,
  dir: 'up' | 'down',
): { spec: TransactionSpec; to: NoteHeading | null } | null {
  const { doc } = state;
  const headings = noteHeadings(doc);
  if (dir === 'down') {
    const next = headings.find((h) => h.line > block.last);
    if (!next) return null;
    const spec = moveBlock(state, block, next.line + 1, 'move.section');
    return spec ? { spec, to: next } : null;
  }
  const own = sectionOf(headings, block.first);
  if (!own) return null;
  const previous = sectionOf(headings, own.line);
  const spec = moveBlock(
    state,
    block,
    sectionEnd(doc, headings, previous, block),
    'move.section',
  );
  return spec ? { spec, to: previous } : null;
}

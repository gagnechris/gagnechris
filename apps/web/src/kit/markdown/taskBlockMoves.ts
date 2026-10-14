import {
  ChangeSet,
  EditorSelection,
  type EditorState,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import {
  noteHeadings as headingsOf,
  reindent,
  sectionEnd as sectionEndOf,
  type NoteHeading,
} from '@gagnechris/shared';
import { blockEnd } from './lineMoves';

/** Line numbers, one-based and inclusive. */
export type LineBlock = { first: number; last: number };

/** The note's `##` headings outside code fences, one-based. */
export const noteHeadings = (doc: Text): NoteHeading[] =>
  headingsOf(doc.toJSON()).map((h) => ({ ...h, line: h.line + 1 }));

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

/** Indents or outdents the block in place, keeping the selection on its text. */
export function reindentBlock(
  state: EditorState,
  block: LineBlock,
  delta: number,
  userEvent: string,
): TransactionSpec | null {
  const { doc } = state;
  const from = doc.line(block.first).from;
  const to = doc.line(block.last).to;
  const text = doc.sliceString(from, to);
  const next = reindent(text, delta);
  if (next === text) return null;
  const changes = state.changes({ from, to, insert: next });
  return {
    changes,
    selection: state.selection.map(changes, 1),
    userEvent,
  };
}

/**
 * Moves the block so it starts at line `before`, or to the end of the note
 * when `before` is past the last line. Null when it would not move.
 */
export function moveBlock(
  state: EditorState,
  block: LineBlock,
  before: number,
  userEvent: string,
  indent = 0,
): TransactionSpec | null {
  const { doc } = state;
  const { first, last } = block;
  if (before >= first && before <= last + 1) {
    return indent ? reindentBlock(state, block, indent, userEvent) : null;
  }
  if (first === 1 && last === doc.lines) return null;
  const original = doc.sliceString(doc.line(first).from, doc.line(last).to);
  const text = reindent(original, indent);
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
      ? newStart + Math.max(0, Math.min(text.length, pos - oldStart + indent))
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
  const zero = (h: NoteHeading) => ({ ...h, line: h.line - 1 });
  return (
    sectionEndOf(doc.toJSON(), headings.map(zero), heading && zero(heading), {
      first: block.first - 1,
      last: block.last - 1,
    }) + 1
  );
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

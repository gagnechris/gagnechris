import {
  EditorSelection,
  type EditorState,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import type { Command } from '@codemirror/view';

const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;

/**
 * Enter inside a Markdown list item starts the next item (an unchecked box
 * after a checklist item, the next number after a numbered one); Enter on an
 * empty item ends the list.
 */
export const continueMarkdownList: StateCommand = ({ state, dispatch }) => {
  const changes = listContinuation(state);
  if (!changes) return false;
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

function listContinuation(state: EditorState) {
  const { main } = state.selection;
  if (!main.empty || state.selection.ranges.length > 1) return null;
  const line = state.doc.lineAt(main.head);
  const match = LIST_ITEM.exec(line.text);
  if (!match) return null;
  const markerEnd = line.from + match[0].length;
  if (main.head < markerEnd) return null;

  const [, indent, bullet, number, delimiter, gap, box] = match;
  if (line.text.slice(match[0].length).trim() === '') {
    return {
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
    };
  }
  const marker = bullet ?? `${Number(number) + 1}${delimiter}`;
  const insert = `\n${indent}${marker}${gap}${box ? '[ ] ' : ''}`;
  return {
    changes: { from: main.head, insert },
    selection: { anchor: main.head + insert.length },
  };
}

function listTextStart(state: EditorState, head: number): number | null {
  const line = state.doc.lineAt(head);
  const match = LIST_ITEM.exec(line.text);
  return match ? line.from + match[0].length : null;
}

function moveTo(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  target: (head: number) => number | null,
  extend: boolean,
): boolean {
  let moved = false;
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => {
      const to = target(range.head);
      if (to === null || to === range.head) return range;
      moved = true;
      return extend
        ? EditorSelection.range(range.anchor, to)
        : EditorSelection.cursor(to);
    }),
    state.selection.mainIndex,
  );
  if (!moved) return false;
  dispatch(
    state.update({ selection, scrollIntoView: true, userEvent: 'select' }),
  );
  return true;
}

/**
 * Ctrl+A in a list item goes to the start of its text, past the marker and
 * any checkbox, like a paragraph start in Notes. From there, the default
 * binding takes over and goes to the line start.
 */
const listItemStart =
  (extend: boolean): StateCommand =>
  ({ state, dispatch }) =>
    moveTo(
      state,
      dispatch,
      (head) => {
        const textStart = listTextStart(state, head);
        return textStart !== null && head > textStart ? textStart : null;
      },
      extend,
    );

export const cursorListItemStart = listItemStart(false);
export const selectListItemStart = listItemStart(true);

/**
 * Home and Cmd+Left: the same, but only on an item's first visual line, so a
 * wrapped item still goes to the start of the row the caret is on.
 */
const listItemBoundary =
  (extend: boolean): Command =>
  (view) =>
    moveTo(
      view.state,
      view.dispatch,
      (head) => {
        const textStart = listTextStart(view.state, head);
        if (textStart === null || head <= textStart) return null;
        const rowStart = view.moveToLineBoundary(
          EditorSelection.cursor(head),
          false,
        ).head;
        return rowStart <= textStart ? textStart : null;
      },
      extend,
    );

export const cursorListItemBoundary = listItemBoundary(false);
export const selectListItemBoundary = listItemBoundary(true);

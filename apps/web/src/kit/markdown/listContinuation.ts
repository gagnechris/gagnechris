import type { EditorState, StateCommand } from '@codemirror/state';

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

import {
  EditorSelection,
  type EditorState,
  type StateCommand,
  type Text,
} from '@codemirror/state';

const ITEM = /^[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\{\{task:)/;

const indentOf = (text: string) => /^[ \t]*/.exec(text)![0].length;
const blank = (text: string) => text.trim().length === 0;

/** The last line of the item at `n` and the lines indented under it. */
function blockEnd(doc: Text, n: number): number {
  const head = doc.line(n).text;
  if (!ITEM.test(head)) return n;
  const base = indentOf(head);
  let end = n;
  while (end < doc.lines) {
    const next = doc.line(end + 1).text;
    if (blank(next) || indentOf(next) <= base) break;
    end += 1;
  }
  return end;
}

/** The first line of the block that ends at `n`, for a block at indent `base`. */
function blockStart(doc: Text, n: number, base: number): number {
  let start = n;
  while (start > 1) {
    const text = doc.line(start).text;
    if (blank(text) || indentOf(text) <= base) break;
    start -= 1;
  }
  const head = doc.line(start).text;
  return !blank(head) && ITEM.test(head) && blockEnd(doc, start) >= n
    ? start
    : n;
}

function move(state: EditorState, dir: -1 | 1) {
  const { doc } = state;
  const sel = state.selection.main;
  const first = doc.lineAt(sel.from).number;
  const lastSel = doc.lineAt(sel.to).number;
  const last = Math.max(lastSel, blockEnd(doc, lastSel));
  const base = indentOf(doc.line(first).text);

  let from: number;
  let to: number;
  if (dir === 1) {
    if (last >= doc.lines) return null;
    from = last + 1;
    to = blockEnd(doc, from);
  } else {
    if (first <= 1) return null;
    to = first - 1;
    from = blockStart(doc, to, base);
  }

  const moving = doc.sliceString(doc.line(first).from, doc.line(last).to);
  const other = doc.sliceString(doc.line(from).from, doc.line(to).to);
  const start = doc.line(Math.min(first, from)).from;
  const end = doc.line(Math.max(last, to)).to;
  const insert = dir === 1 ? `${other}\n${moving}` : `${moving}\n${other}`;
  const shift = dir === 1 ? other.length + 1 : -(other.length + 1);
  return state.update({
    changes: { from: start, to: end, insert },
    selection: EditorSelection.range(sel.anchor + shift, sel.head + shift),
    scrollIntoView: true,
    userEvent: 'move.line',
  });
}

/**
 * ⌥↑ / ⌥↓: moves the selected lines past the line or item next to them. A
 * list item, checklist item or task embed carries the lines indented under
 * it, and steps over a neighbouring item together with that item's own.
 */
export const moveLinesUp: StateCommand = ({ state, dispatch }) => {
  const tr = move(state, -1);
  if (tr) dispatch(tr);
  return true;
};

export const moveLinesDown: StateCommand = ({ state, dispatch }) => {
  const tr = move(state, 1);
  if (tr) dispatch(tr);
  return true;
};

import type { EditorView } from '@codemirror/view';

const INDENT = /^[ \t]*/;
const TASK_PREFIX = '[ ] ';

function caretLine(view: EditorView) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const start = line.from + INDENT.exec(line.text)![0].length;
  return { head, line, start, rest: line.text.slice(start - line.from) };
}

function insertAtLineStart(view: EditorView, prefix: string) {
  const { head, start } = caretLine(view);
  view.dispatch({
    changes: { from: start, insert: prefix },
    selection: { anchor: head < start ? head : head + prefix.length },
    userEvent: 'input',
  });
}

/** Adds `prefix` at the start of the caret's line, or removes it if present. */
export function toggleLinePrefix(view: EditorView, prefix: string) {
  const { start, rest } = caretLine(view);
  if (rest.startsWith(prefix)) {
    view.dispatch({
      changes: { from: start, to: start + prefix.length },
      userEvent: 'delete',
    });
  } else {
    insertAtLineStart(view, prefix);
  }
  view.focus();
}

/** `[ ] ` at the start of the line; Enter or leaving the line makes the task. */
export function makeTaskLine(view: EditorView) {
  if (!caretLine(view).rest.startsWith(TASK_PREFIX)) {
    insertAtLineStart(view, TASK_PREFIX);
  }
  view.focus();
}

/** Types `text` at the caret, after a space unless one is already there. */
function typeWord(view: EditorView, text: string) {
  const { head, line, start } = caretLine(view);
  const before = view.state.doc.sliceString(
    Math.max(line.from, head - 1),
    head,
  );
  const insert = head <= start || /\s/.test(before) ? text : ` ${text}`;
  view.dispatch({
    changes: { from: head, insert },
    selection: { anchor: head + insert.length },
    userEvent: 'input.type',
  });
  view.focus();
}

/** `@` on a task line, which opens the date menu. */
export function startTaskDate(view: EditorView) {
  if (!caretLine(view).rest.startsWith(TASK_PREFIX)) {
    insertAtLineStart(view, TASK_PREFIX);
  }
  typeWord(view, '@');
}

export function startPriority(view: EditorView) {
  typeWord(view, '!');
}

export function hideKeyboard(view: EditorView) {
  view.contentDOM.blur();
}

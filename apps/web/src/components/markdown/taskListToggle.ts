import { Prec } from '@codemirror/state';
import {
  EditorSelection,
  type ChangeSpec,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/** Negative lookahead avoids matching markdown links like `- [x](url)`. */
const TASK_LINE = /^(\s*[-*+]\s+)\[([ xX])\](?!\()/;

export type TaskCheckbox = {
  /** Absolute doc position of `[`. */
  boxFrom: number;
  /** Absolute doc position after `]`. */
  boxTo: number;
  checked: boolean;
};

export function taskCheckboxAt(
  lineText: string,
  lineFrom: number,
): TaskCheckbox | null {
  const match = TASK_LINE.exec(lineText);
  if (!match) return null;
  const prefixLen = match[1].length;
  return {
    boxFrom: lineFrom + prefixLen,
    boxTo: lineFrom + prefixLen + 3,
    checked: match[2] !== ' ',
  };
}

/** True when `pos` is strictly inside `[ ]` / `[x]` (not on the brackets). */
export function isStrictlyInsideTaskBox(
  pos: number,
  task: TaskCheckbox,
): boolean {
  return pos > task.boxFrom && pos < task.boxTo;
}

export function toggleTaskAtPos(
  view: EditorView,
  pos: number,
  requireInsideBrackets = false,
): boolean {
  if (view.state.readOnly) return false;
  const line = view.state.doc.lineAt(pos);
  const task = taskCheckboxAt(line.text, line.from);
  if (!task) return false;
  if (requireInsideBrackets && !isStrictlyInsideTaskBox(pos, task)) {
    return false;
  }
  const insert = task.checked ? '[ ]' : '[x]';
  const change: ChangeSpec = { from: task.boxFrom, to: task.boxTo, insert };
  view.dispatch({
    changes: change,
    selection: EditorSelection.cursor(task.boxFrom + insert.length),
    userEvent: 'input.toggleTask',
  });
  return true;
}

function toggleTaskNearSelection(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  return toggleTaskAtPos(view, head, false);
}

/**
 * Opt-in: the blog editor leaves this off so typing `- [ ] ` inserts spaces
 * normally. Mod-Shift-x avoids clashing with ⌘⏎ / basicSetup.
 */
export function taskListToggle(): Extension {
  return [
    Prec.high(
      keymap.of([
        {
          key: 'Mod-Shift-x',
          run: toggleTaskNearSelection,
        },
        {
          key: ' ',
          run: (view) =>
            toggleTaskAtPos(view, view.state.selection.main.head, true),
        },
      ]),
    ),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        if (!toggleTaskAtPos(view, pos, true)) return false;
        event.preventDefault();
        return true;
      },
    }),
  ];
}

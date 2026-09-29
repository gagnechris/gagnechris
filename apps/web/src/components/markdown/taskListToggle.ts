import { Prec } from '@codemirror/state';
import {
  EditorSelection,
  type ChangeSpec,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/**
 * GFM task list marker: `- [ ]` / `- [x]` (also `*` / `+`).
 * Negative lookahead avoids matching markdown links like `- [x](url)`.
 */
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

/** Toggle `- [ ]` ↔ `- [x]` when `pos` is on that line (optionally only inside the brackets). */
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
 * Opt-in click / keyboard toggle for markdown task-list checkboxes (CHR-148).
 * Pass via `MarkdownEditor` `extensions={[taskListToggle()]}` (e.g. Notebook).
 * The blog editor leaves this off so typing `- [ ] ` inserts spaces normally.
 *
 * - Click strictly inside `[ ]` / `[x]` toggles
 * - Space while the cursor is strictly inside the brackets toggles
 * - Mod-Shift-x toggles the task on the current line (avoids ⌘⏎ / basicSetup clash)
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

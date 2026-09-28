import {
  EditorSelection,
  type ChangeSpec,
  type Extension,
} from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

/** GFM task list marker: `- [ ]` / `- [x]` (also `*` / `+`). */
const TASK_LINE = /^(\s*[-*+]\s+)\[([ xX])\]/

export type TaskCheckbox = {
  /** Absolute doc position of `[`. */
  boxFrom: number
  /** Absolute doc position after `]`. */
  boxTo: number
  checked: boolean
}

export function taskCheckboxAt(
  lineText: string,
  lineFrom: number,
): TaskCheckbox | null {
  const match = TASK_LINE.exec(lineText)
  if (!match) return null
  const prefixLen = match[1].length
  return {
    boxFrom: lineFrom + prefixLen,
    boxTo: lineFrom + prefixLen + 3,
    checked: match[2] !== ' ',
  }
}

/** Toggle `- [ ]` ↔ `- [x]` when `pos` is on that line (optionally only inside the brackets). */
export function toggleTaskAtPos(
  view: EditorView,
  pos: number,
  requireInsideBrackets = false,
): boolean {
  if (view.state.readOnly) return false
  const line = view.state.doc.lineAt(pos)
  const task = taskCheckboxAt(line.text, line.from)
  if (!task) return false
  if (requireInsideBrackets && (pos < task.boxFrom || pos > task.boxTo)) {
    return false
  }
  const insert = task.checked ? '[ ]' : '[x]'
  const change: ChangeSpec = { from: task.boxFrom, to: task.boxTo, insert }
  view.dispatch({
    changes: change,
    selection: EditorSelection.cursor(task.boxFrom + insert.length),
    userEvent: 'input.toggleTask',
  })
  return true
}

function toggleTaskNearSelection(view: EditorView): boolean {
  const { head } = view.state.selection.main
  return toggleTaskAtPos(view, head, false)
}

/**
 * Click / keyboard toggle for markdown task-list checkboxes.
 * - Click on `[ ]` / `[x]` toggles
 * - Space while the cursor is inside the brackets toggles
 * - Mod-Enter toggles the task on the current line
 */
export function taskListToggle(): Extension {
  return [
    keymap.of([
      {
        key: 'Mod-Enter',
        run: toggleTaskNearSelection,
      },
      {
        key: ' ',
        run: (view) => toggleTaskAtPos(view, view.state.selection.main.head, true),
      },
    ]),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey) return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos == null) return false
        if (!toggleTaskAtPos(view, pos, true)) return false
        event.preventDefault()
        return true
      },
    }),
  ]
}

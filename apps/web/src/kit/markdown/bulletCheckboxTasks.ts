import { EditorSelection, type Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { bulletCheckboxAsTask } from '@gagnechris/shared';

/**
 * The `]` that completes `- [ ]` at a bullet's start turns the bullet into a
 * task line. The `]` and the conversion are separate undo steps, so undo
 * right after brings the checklist bullet back.
 */
export function bulletCheckboxTasks(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== ']' || from !== to || view.state.readOnly) return false;
    const line = view.state.doc.lineAt(from);
    if (line.text[from - line.from] === '(') return false;
    const task = bulletCheckboxAsTask(
      line.text.slice(0, from - line.from) + ']',
    );
    if (task === null) return false;
    view.dispatch({
      changes: { from, insert: ']' },
      selection: EditorSelection.cursor(from + 1),
      userEvent: 'input.type',
    });
    view.dispatch({
      changes: { from: line.from, to: from + 1, insert: task },
      selection: EditorSelection.cursor(line.from + task.length),
      userEvent: 'input.convertTask',
      annotations: isolateHistory.of('full'),
    });
    return true;
  });
}

import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { bulletCheckboxTasks } from './bulletCheckboxTasks';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

function setup(doc: string, cursor = doc.length) {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [history(), bulletCheckboxTasks()],
    }),
  });
  return view;
}

/** What the browser's typing path does: the handlers first, else a plain insert. */
function type(v: EditorView, text: string) {
  const { from, to } = v.state.selection.main;
  const insert = () =>
    v.state.update({
      changes: { from, to, insert: text },
      selection: EditorSelection.cursor(from + text.length),
      userEvent: 'input.type',
    });
  const handled = v.state
    .facet(EditorView.inputHandler)
    .some((handler) => handler(v, from, to, text, insert));
  if (!handled) v.dispatch(insert());
}

describe('bulletCheckboxTasks', () => {
  test('typing - [ ] at a bullet start makes the line a task line', () => {
    const v = setup('## Focus\n');
    for (const ch of '  - [ ] Buy milk') type(v, ch);
    expect(v.state.doc.toString()).toBe('## Focus\n  [ ] Buy milk');
  });

  test('undo right after brings the checklist bullet back', () => {
    const v = setup('- [ ');
    type(v, ']');
    expect(v.state.doc.toString()).toBe('[ ]');
    undo(v);
    expect(v.state.doc.toString()).toBe('- [ ]');
  });

  test('a link, a checked box and text before the box are left alone', () => {
    const v = setup('- [ (url)', 4);
    type(v, ']');
    expect(v.state.doc.toString()).toBe('- [ ](url)');

    const checked = setup('- [x');
    type(checked, ']');
    expect(checked.state.doc.toString()).toBe('- [x]');

    const later = setup('- note [ ');
    type(later, ']');
    expect(later.state.doc.toString()).toBe('- note [ ]');
  });
});

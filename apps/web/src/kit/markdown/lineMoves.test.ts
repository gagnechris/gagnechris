import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { moveLinesDown, moveLinesUp } from './lineMoves';

function run(
  doc: string,
  from: number,
  command: typeof moveLinesUp,
  to = from,
) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.range(from, to),
    extensions: [history()],
  });
  command({
    state,
    dispatch: (tr) => {
      state = tr.state;
    },
  });
  return state;
}

describe('line moves', () => {
  test('⌥↓ swaps a paragraph line with the line below and keeps the caret on it; undo restores it', () => {
    const doc = 'one\ntwo\nthree';
    const state = run(doc, 1, moveLinesDown);
    expect(state.doc.toString()).toBe('two\none\nthree');
    expect(state.selection.main.head).toBe(5);

    let undone = state;
    undo({
      state,
      dispatch: (tr) => {
        undone = tr.state;
      },
    });
    expect(undone.doc.toString()).toBe(doc);
  });

  test('⌥↑ on the first line and ⌥↓ on the last do nothing', () => {
    expect(run('a\nb', 0, moveLinesUp).doc.toString()).toBe('a\nb');
    expect(run('a\nb', 2, moveLinesDown).doc.toString()).toBe('a\nb');
  });

  test('two selected list items move up together', () => {
    const doc = 'intro\n- a\n- b\n- c';
    const state = run(doc, doc.indexOf('b'), moveLinesUp, doc.indexOf('c'));
    expect(state.doc.toString()).toBe('intro\n- b\n- c\n- a');
  });

  test('a list item moves with the lines indented under it', () => {
    const doc = '- a\n  - a1\n  more\n- b';
    const state = run(doc, 2, moveLinesDown);
    expect(state.doc.toString()).toBe('- b\n- a\n  - a1\n  more');
  });

  test('an item steps over a neighbouring item and its children as one', () => {
    const doc = '- a\n  - a1\n- b';
    const state = run(doc, doc.indexOf('- b') + 2, moveLinesUp);
    expect(state.doc.toString()).toBe('- b\n- a\n  - a1');
  });

  test('a task embed line carries its indented lines', () => {
    const embed = '{{task:01JAAAAAAAAAAAAAAAAAAAAAAA}}';
    const doc = `${embed}\n  context\nnext`;
    const state = run(doc, 0, moveLinesDown);
    expect(state.doc.toString()).toBe(`next\n${embed}\n  context`);
  });
});

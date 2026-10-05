import { afterEach, describe, expect, test } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  makeTaskLine,
  startPriority,
  startTaskDate,
  toggleLinePrefix,
} from './editorAccessory';

let view: EditorView | undefined;

/** `|` marks the caret. */
function editor(text: string) {
  const caret = text.indexOf('|');
  view = new EditorView({
    state: EditorState.create({
      doc: text.replace('|', ''),
      selection: EditorSelection.cursor(caret),
    }),
    parent: document.body,
  });
  return view;
}

const shown = (v: EditorView) => {
  const doc = v.state.doc.toString();
  const head = v.state.selection.main.head;
  return `${doc.slice(0, head)}|${doc.slice(head)}`;
};

afterEach(() => view?.destroy());

describe('editor accessory commands', () => {
  test('Task starts the caret’s line with [ ] once, after its indent', () => {
    const v = editor('Notes\n  Call |mom');
    makeTaskLine(v);
    expect(shown(v)).toBe('Notes\n  [ ] Call |mom');
    makeTaskLine(v);
    expect(shown(v)).toBe('Notes\n  [ ] Call |mom');

    const empty = editor('Notes\n|');
    makeTaskLine(empty);
    expect(shown(empty)).toBe('Notes\n[ ] |');
  });

  test('date types @ on a task line, making the line a task first', () => {
    const v = editor('Renew passport|');
    startTaskDate(v);
    expect(shown(v)).toBe('[ ] Renew passport @|');

    const spaced = editor('[ ] Renew passport |');
    startTaskDate(spaced);
    expect(shown(spaced)).toBe('[ ] Renew passport @|');
  });

  test('priority types ! after a space', () => {
    const v = editor('[ ] Ship it|');
    startPriority(v);
    expect(shown(v)).toBe('[ ] Ship it !|');
  });

  test('heading and list prefixes toggle', () => {
    const v = editor('Plan|');
    toggleLinePrefix(v, '## ');
    expect(shown(v)).toBe('## Plan|');
    toggleLinePrefix(v, '## ');
    expect(shown(v)).toBe('Plan|');
    toggleLinePrefix(v, '- ');
    expect(shown(v)).toBe('- Plan|');
  });
});

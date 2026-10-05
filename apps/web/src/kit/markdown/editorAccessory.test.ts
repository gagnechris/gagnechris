import { afterEach, describe, expect, test } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  insertCodeBlock,
  insertImages,
  insertLink,
  makeTaskLine,
  startPriority,
  startTaskDate,
  toggleLinePrefix,
} from './editorAccessory';

let view: EditorView | undefined;

/** `|` marks the caret; `[` and `]` mark a selection instead. */
function editor(text: string) {
  const caret = text.indexOf('|');
  const from = text.indexOf('[');
  const selection =
    caret >= 0
      ? EditorSelection.cursor(caret)
      : EditorSelection.range(from, text.indexOf(']') - 1);
  view = new EditorView({
    state: EditorState.create({
      doc: caret >= 0 ? text.replace('|', '') : text.replace(/[[\]]/g, ''),
      selection,
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

const selected = (v: EditorView) => {
  const { from, to } = v.state.selection.main;
  return v.state.sliceDoc(from, to);
};

describe('body toolbar commands', () => {
  test('Link wraps the selection and selects the URL', () => {
    const v = editor('See [the docs] here');
    insertLink(v);
    expect(v.state.doc.toString()).toBe('See [the docs](https://) here');
    expect(selected(v)).toBe('https://');
  });

  test('Link with no selection inserts placeholder text', () => {
    const v = editor('See |');
    insertLink(v);
    expect(v.state.doc.toString()).toBe('See [link text](https://)');
  });

  test('Code block fences the selection on lines of its own', () => {
    const v = editor('Run [npm test] now');
    insertCodeBlock(v);
    expect(v.state.doc.toString()).toBe('Run \n```\nnpm test\n```\n now');
    expect(selected(v)).toBe('npm test');
  });

  test('Code block on an empty line puts the caret inside the fence', () => {
    const v = editor('Intro\n|');
    insertCodeBlock(v);
    expect(shown(v)).toBe('Intro\n```\n|\n```');
  });

  test('Images insert one per paragraph at the caret', () => {
    const v = editor('Before |');
    insertImages(v, [
      { alt: 'one', path: '/media/1.png' },
      { alt: 'two', path: '/media/2.png' },
    ]);
    expect(shown(v)).toBe(
      'Before ![one](/media/1.png)\n\n![two](/media/2.png)|',
    );
  });
});

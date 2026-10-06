import { deleteCharBackward } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { livePreview } from './livePreview';
import { taskEmbedEditor } from './taskEmbeds';

const TASK = '01JAAAAAAAAAAAAAAAAAAAAAAA';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view?.dom.remove();
  view = undefined;
});

function setup(doc: string, cursor = doc.length) {
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [
        livePreview(),
        taskEmbedEditor({
          host: { attach: () => {}, detach: () => {} },
          onCreate: () => {},
        }),
      ],
    }),
  });
  return view;
}

const lineText = (v: EditorView, n: number) =>
  v.contentDOM.querySelectorAll('.cm-line')[n - 1]!.textContent;

const moveTo = (v: EditorView, pos: number) =>
  v.dispatch({ selection: EditorSelection.cursor(pos) });

describe('livePreview', () => {
  test('a heading, list and link render in place off the caret line, and show their markdown on it', () => {
    const doc = '# Plan\n- ship [docs](https://x.dev) **today**\nend';
    const v = setup(doc);
    const heading = v.contentDOM.querySelector('.cm-md-h1')!;
    expect(heading.textContent).toBe('Plan');
    expect(lineText(v, 2)).toBe('• ship docs today');
    expect(v.contentDOM.querySelector('.cm-md-link')).toHaveAttribute(
      'title',
      'https://x.dev',
    );
    expect(v.contentDOM.querySelector('.cm-md-strong')!.textContent).toBe(
      'today',
    );

    moveTo(v, 2);
    expect(lineText(v, 1)).toBe('# Plan');
    expect(lineText(v, 2)).toBe('• ship docs today');

    moveTo(v, doc.indexOf('ship'));
    expect(lineText(v, 1)).toBe('Plan');
    expect(lineText(v, 2)).toBe('- ship [docs](https://x.dev) **today**');
  });

  test('code spans keep their text and fenced blocks keep their syntax', () => {
    const doc = 'run `npm *test*`\n```\n# not a heading\n```\nend';
    const v = setup(doc);
    expect(lineText(v, 1)).toBe('run npm *test*');
    expect(v.contentDOM.querySelector('.cm-md-em')).toBeNull();
    expect(lineText(v, 3)).toBe('# not a heading');
    expect(v.contentDOM.querySelector('.cm-md-h1')).toBeNull();
  });

  test('snake_case and checklists are left alone', () => {
    const v = setup('call my_fn_name\n- [ ] buy milk\nend');
    expect(lineText(v, 1)).toBe('call my_fn_name');
    expect(lineText(v, 2)).toBe('- [ ] buy milk');
  });

  test('Backspace after a task embed removes the whole embed', () => {
    const doc = `Standup\n{{task:${TASK}}}`;
    const v = setup(doc);
    deleteCharBackward(v);
    expect(v.state.doc.toString()).toBe('Standup\n');
  });
});

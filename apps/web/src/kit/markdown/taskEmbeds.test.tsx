import { history, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { taskEmbedEditor, type TaskEmbedCreate } from './taskEmbeds';

const ID_A = '01JAAAAAAAAAAAAAAAAAAAAAAA';
const ID_B = '01JBBBBBBBBBBBBBBBBBBBBBBB';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view?.dom.remove();
  view = undefined;
});

function setup(doc = '', ids = [ID_A, ID_B]) {
  const created: TaskEmbedCreate[] = [];
  const attached: string[] = [];
  const queue = [...ids];
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        taskEmbedEditor({
          host: {
            attach: (_el, id) => attached.push(id),
            detach: () => {},
          },
          onCreate: (create) => created.push(create),
          newId: () => queue.shift() ?? 'exhausted',
        }),
      ],
    }),
  });
  return { view, created, attached };
}

function type(v: EditorView, text: string) {
  for (const ch of text) {
    const head = v.state.selection.main.head;
    v.dispatch({
      changes: { from: head, insert: ch },
      selection: EditorSelection.cursor(head + 1),
      userEvent: 'input.type',
    });
  }
}

function pressEnter(v: EditorView) {
  const head = v.state.selection.main.head;
  v.dispatch({
    changes: { from: head, insert: '\n' },
    selection: EditorSelection.cursor(head + 1),
    userEvent: 'input',
  });
}

describe('taskEmbedEditor', () => {
  test('[ ] text then Enter creates one task and leaves only the token', () => {
    const { view, created, attached } = setup('Standup\n');
    view.dispatch({ selection: EditorSelection.cursor(8) });
    type(view, '[ ] Call Sam');
    expect(created).toEqual([]);

    pressEnter(view);
    type(view, 'context');

    expect(created).toEqual([{ id: ID_A, draft: { title: 'Call Sam' } }]);
    expect(view.state.doc.toString()).toBe(
      `Standup\n{{task:${ID_A}}}\ncontext`,
    );
    expect(attached).toEqual([ID_A]);
  });

  test('moving the cursor off the line or blurring also converts it', () => {
    const { view, created } = setup('one\n\ntwo');
    view.dispatch({ selection: EditorSelection.cursor(4) });
    type(view, '  [ ] Draft spec');
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(view.state.doc.line(2).text).toBe(`  {{task:${ID_A}}}`);

    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    type(view, '\n[ ] Second');
    view.contentDOM.dispatchEvent(new FocusEvent('blur'));
    expect(created.map((c) => c.draft.title)).toEqual(['Draft spec', 'Second']);
    expect(view.state.doc.toString()).toContain(`{{task:${ID_B}}}`);
  });

  test('checklists, empty boxes, fenced code and loaded text stay as written', () => {
    const { view, created } = setup('```\n\n```\n[ ] loaded\n');
    view.dispatch({ selection: EditorSelection.cursor(4) });
    type(view, '[ ] in code');
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    type(view, '- [ ] checklist');
    pressEnter(view);
    type(view, '[ ] ');
    pressEnter(view);
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(created).toEqual([]);
    expect(view.state.doc.toString()).toContain('[ ] loaded');
  });

  test('undo then leaving the same line again re-embeds the same task', () => {
    const { view, created } = setup('');
    type(view, '[ ] Call Sam');
    pressEnter(view);
    undo(view);
    expect(view.state.doc.toString()).toBe('[ ] Call Sam');
    type(view, ' ');
    view.dispatch({ selection: EditorSelection.cursor(0) });
    view.dispatch({
      selection: EditorSelection.cursor(view.state.doc.length),
    });
    type(view, '\n');
    expect(created.map((c) => c.id)).toEqual([ID_A, ID_A]);
    expect(view.state.doc.toString()).toBe(`{{task:${ID_A}}}\n`);
  });

  test('a remote replace of the document never creates a task', () => {
    const onCreate = vi.fn();
    view = new EditorView({
      parent: document.body.appendChild(document.createElement('div')),
      state: EditorState.create({
        doc: '',
        extensions: [
          taskEmbedEditor({
            host: { attach: () => {}, detach: () => {} },
            onCreate,
          }),
        ],
      }),
    });
    type(view, '[ ] typed');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '[ ] remote\n' },
    });
    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) });
    expect(onCreate).not.toHaveBeenCalled();
  });
});

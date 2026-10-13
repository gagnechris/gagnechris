import { history, undo } from '@codemirror/commands';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import {
  blockAt,
  jumpSection,
  moveBlock,
  moveBlockToSection,
  noteHeadings,
  reindentBlock,
} from './taskBlockMoves';

const A = '{{task:01JTASKAAAAAAAAAAAAAAAAAAA}}';
const B = '{{task:01JTASKBBBBBBBBBBBBBBBBBBB}}';
const C = '{{task:01JTASKCCCCCCCCCCCCCCCCCCC}}';

const NOTE = [
  '## Carried in',
  A,
  '  context for A',
  B,
  '',
  '## Meetings',
  C,
  'notes',
  '',
  '## Later',
  'idea',
].join('\n');

const stateOf = (doc: string, caret = 0) =>
  EditorState.create({
    doc,
    selection: { anchor: caret },
    extensions: [history()],
  });

const apply = (state: EditorState, spec: TransactionSpec | null) => {
  expect(spec).not.toBeNull();
  return state.update(spec!).state;
};

const lines = (state: EditorState) => state.doc.toString().split('\n');

describe('noteHeadings', () => {
  test('lists ## headings and skips fenced code and other levels', () => {
    const doc = stateOf(
      '# Title\n## One\n```\n## not\n```\n### Three\n## Two ##',
    ).doc;
    expect(noteHeadings(doc)).toEqual([
      { line: 2, title: 'One' },
      { line: 7, title: 'Two' },
    ]);
  });
});

describe('moveBlock', () => {
  test('moves a task with its indented line before another line and keeps the caret on it; undo puts it back', () => {
    const state = stateOf(NOTE, NOTE.indexOf(A) + 3);
    const next = apply(
      state,
      moveBlock(state, blockAt(state.doc, 2), 8, 'move.drop'),
    );
    expect(lines(next)).toEqual([
      '## Carried in',
      B,
      '',
      '## Meetings',
      C,
      A,
      '  context for A',
      'notes',
      '',
      '## Later',
      'idea',
    ]);
    expect(next.selection.main.head).toBe(next.doc.toString().indexOf(A) + 3);

    let undone = next;
    undo({ state: next, dispatch: (tr) => (undone = tr.state) });
    expect(undone.doc.toString()).toBe(NOTE);
  });

  test('moves the last block up, and a block to the end of the note', () => {
    const doc = `one\n${A}\ntwo\n${B}`;
    const state = stateOf(doc);
    expect(
      lines(apply(state, moveBlock(state, blockAt(state.doc, 4), 1, 'x'))),
    ).toEqual([B, 'one', A, 'two']);
    expect(
      lines(apply(state, moveBlock(state, blockAt(state.doc, 2), 5, 'x'))),
    ).toEqual(['one', 'two', B, A]);
  });

  test('is null for a drop on its own place', () => {
    const state = stateOf(NOTE);
    const block = blockAt(state.doc, 2);
    expect(block).toEqual({ first: 2, last: 3 });
    expect(moveBlock(state, block, 2, 'x')).toBeNull();
    expect(moveBlock(state, block, 3, 'x')).toBeNull();
    expect(moveBlock(state, block, 4, 'x')).toBeNull();
  });
});

describe('sections', () => {
  test('Move to a section puts the task after the last text in it', () => {
    const state = stateOf(NOTE);
    const [, meetings] = noteHeadings(state.doc);
    const next = apply(
      state,
      moveBlockToSection(state, blockAt(state.doc, 4), meetings!),
    );
    expect(lines(next)).toEqual([
      '## Carried in',
      A,
      '  context for A',
      '',
      '## Meetings',
      C,
      'notes',
      B,
      '',
      '## Later',
      'idea',
    ]);
  });

  test('⌥⇧↓ puts the task first in the next section', () => {
    const state = stateOf(NOTE);
    const jump = jumpSection(state, blockAt(state.doc, 2), 'down');
    expect(jump?.to?.title).toBe('Meetings');
    expect(lines(apply(state, jump!.spec))).toEqual([
      '## Carried in',
      B,
      '',
      '## Meetings',
      A,
      '  context for A',
      C,
      'notes',
      '',
      '## Later',
      'idea',
    ]);
  });

  test('⌥⇧↑ puts the task last in the section before its own', () => {
    const state = stateOf(NOTE);
    const jump = jumpSection(state, blockAt(state.doc, 7), 'up');
    expect(jump?.to?.title).toBe('Carried in');
    expect(lines(apply(state, jump!.spec))).toEqual([
      '## Carried in',
      A,
      '  context for A',
      B,
      C,
      '',
      '## Meetings',
      'notes',
      '',
      '## Later',
      'idea',
    ]);
  });

  test('⌥⇧↓ in the last section and ⌥⇧↑ above the first heading do nothing', () => {
    const state = stateOf(`${A}\n## Only\n${B}`);
    expect(jumpSection(state, blockAt(state.doc, 3), 'down')).toBeNull();
    expect(jumpSection(state, blockAt(state.doc, 1), 'up')).toBeNull();
  });
});

describe('changing a task’s level', () => {
  test('a drop can nest the block a step, or take it out of one', () => {
    const doc = `${A}\n${B}\n  under B\n${C}`;
    const state = stateOf(doc);
    expect(
      lines(apply(state, moveBlock(state, blockAt(state.doc, 4), 2, 'x', 2))),
    ).toEqual([A, `  ${C}`, B, '  under B']);
    expect(
      lines(apply(state, moveBlock(state, blockAt(state.doc, 2), 2, 'x', 2))),
    ).toEqual([A, `  ${B}`, '    under B', C]);
    const nested = stateOf(`${A}\n  ${B}\n    under B`);
    expect(
      lines(
        apply(nested, reindentBlock(nested, blockAt(nested.doc, 2), -2, 'x')),
      ),
    ).toEqual([A, B, '  under B']);
  });
});

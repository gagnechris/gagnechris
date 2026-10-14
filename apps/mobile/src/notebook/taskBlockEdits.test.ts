import { describe, expect, it } from 'vitest';
import {
  dropTaskBlock,
  indentTaskBlock,
  moveTaskBlock,
  moveTaskBlockToSection,
  removeTaskBlock,
  taskBlockLines,
} from './taskBlockEdits';

const A = '{{task:01HTASKAAAAAAAAAAAAAAAAAAA}}';
const B = '{{task:01HTASKBBBBBBBBBBBBBBBBBBB}}';
const A_ID = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B_ID = '01HTASKBBBBBBBBBBBBBBBBBBB';

describe('task block edits', () => {
  it('nests a task and its lines under the task above, and takes it out again', () => {
    const note = [A, B, '  context', 'after'].join('\n');
    const nested = indentTaskBlock(note, B_ID, 'in');
    expect(nested).toBe([A, `  ${B}`, '    context', 'after'].join('\n'));
    expect(indentTaskBlock(nested!, B_ID, 'out')).toBe(note);
  });

  it('only nests under a task at the same level', () => {
    expect(indentTaskBlock(['text', A].join('\n'), A_ID, 'in')).toBeNull();
    expect(indentTaskBlock(A, A_ID, 'in')).toBeNull();
    expect(indentTaskBlock(A, A_ID, 'out')).toBeNull();
  });

  it('moves a task with its lines to the end of a section', () => {
    const note = [
      '## Work',
      A,
      '  why',
      'note',
      '',
      '## Home',
      'dishes',
      '',
      '## Later',
    ].join('\n');
    expect(moveTaskBlockToSection(note, A_ID, 1)).toBe(
      [
        '## Work',
        'note',
        '',
        '## Home',
        'dishes',
        A,
        '  why',
        '',
        '## Later',
      ].join('\n'),
    );
    expect(moveTaskBlockToSection(note, A_ID, 0)).toBe(
      [
        '## Work',
        'note',
        A,
        '  why',
        '',
        '## Home',
        'dishes',
        '',
        '## Later',
      ].join('\n'),
    );
  });

  it('moves a task up into an earlier section', () => {
    const note = ['## One', 'first', '## Two', A, '  why'].join('\n');
    expect(moveTaskBlockToSection(note, A_ID, 0)).toBe(
      ['## One', 'first', A, '  why', '## Two'].join('\n'),
    );
  });

  it('takes a nested block out for another note, then removes it here', () => {
    const note = [A, `  ${B}`, '    why', 'after'].join('\n');
    expect(taskBlockLines(note, B_ID)).toBe([B, '  why'].join('\n'));
    expect(removeTaskBlock(note, B_ID)).toBe([A, 'after'].join('\n'));
  });

  it('moves a task with its lines before or after another task', () => {
    const C = '{{task:01HTASKCCCCCCCCCCCCCCCCCCC}}';
    const C_ID = '01HTASKCCCCCCCCCCCCCCCCCCC';
    const note = [A, '  why', 'text', B, C, '  how'].join('\n');
    expect(moveTaskBlock(note, A_ID, { after: C_ID })).toBe(
      ['text', B, C, '  how', A, '  why'].join('\n'),
    );
    expect(moveTaskBlock(note, C_ID, { before: B_ID })).toBe(
      [A, '  why', 'text', C, '  how', B].join('\n'),
    );
    expect(moveTaskBlock(note, B_ID, { before: C_ID })).toBeNull();
  });

  it('does not nest a subtask under the subtask above it', () => {
    const C = '{{task:01HTASKCCCCCCCCCCCCCCCCCCC}}';
    const C_ID = '01HTASKCCCCCCCCCCCCCCCCCCC';
    expect(
      indentTaskBlock([A, `  ${B}`, `  ${C}`].join('\n'), C_ID, 'in'),
    ).toBeNull();
  });

  it('a drop sideways under a top-level task makes a subtask, under a subtask a sibling', () => {
    const C = '{{task:01HTASKCCCCCCCCCCCCCCCCCCC}}';
    const C_ID = '01HTASKCCCCCCCCCCCCCCCCCCC';
    const D = '{{task:01HTASKDDDDDDDDDDDDDDDDDDD}}';
    const note = [A, `  ${B}`, D, `  ${C}`, '    why'].join('\n');
    expect(dropTaskBlock(note, C_ID, { after: B_ID }, 'in')).toBe(
      [A, `  ${B}`, `  ${C}`, '    why', D].join('\n'),
    );
    expect(dropTaskBlock([A, D, C].join('\n'), C_ID, null, 'in')).toBe(
      [A, D, `  ${C}`].join('\n'),
    );
    expect(dropTaskBlock([A, `  ${B}`, C].join('\n'), C_ID, null, 'in')).toBe(
      [A, `  ${B}`, `  ${C}`].join('\n'),
    );
    expect(dropTaskBlock(['text', C].join('\n'), C_ID, null, 'in')).toBeNull();
    expect(dropTaskBlock(note, C_ID, { after: B_ID }, 'out')).toBe(
      [A, `  ${B}`, C, '  why', D].join('\n'),
    );
  });
});

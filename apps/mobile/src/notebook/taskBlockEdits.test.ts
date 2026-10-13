import { describe, expect, it } from 'vitest';
import {
  indentTaskBlock,
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
});

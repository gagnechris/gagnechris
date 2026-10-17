import { describe, expect, test } from 'vitest';
import {
  addMovedTaskBlock,
  insertAfterTaskBlock,
  lineAfterOuterBlock,
  markdownItemBlock,
  noteHeadings,
  reindent,
  sectionEnd,
  taskDropNestIndent,
  taskNestIndent,
} from './task-blocks.js';

const P = '{{task:01JTASKAAAAAAAAAAAAAAAAAAA}}';
const S = '{{task:01JTASKBBBBBBBBBBBBBBBBBBB}}';
const T = '{{task:01JTASKCCCCCCCCCCCCCCCCCCC}}';

describe('task blocks', () => {
  test('an item carries the lines indented under it up to a blank line', () => {
    const lines = ['- a', '  b', '    c', 'd', P, '  e', '', '  f'];
    expect(markdownItemBlock(lines, 0)).toEqual({ first: 0, last: 2 });
    expect(markdownItemBlock(lines, 4)).toEqual({ first: 4, last: 5 });
    expect(markdownItemBlock(lines, 3)).toEqual({ first: 3, last: 3 });
  });

  test('sections are the ## headings outside code fences', () => {
    const lines = [
      'intro',
      '## Work ##',
      'x',
      '```',
      '## code',
      '```',
      '## Home',
    ];
    const headings = noteHeadings(lines);
    expect(headings).toEqual([
      { line: 1, title: 'Work' },
      { line: 6, title: 'Home' },
    ]);
    const none = { first: -1, last: -1 };
    expect(sectionEnd(lines, headings, headings[0]!, none)).toBe(6);
    expect(sectionEnd(lines, headings, null, none)).toBe(1);
    expect(sectionEnd(lines, headings, headings[1]!, none)).toBe(7);
  });

  test('reindent adds spaces to text lines and takes off at most what is there', () => {
    expect(reindent('a\n\n b', 2)).toBe('  a\n\n   b');
    expect(reindent('   a\n b\nc', -2)).toBe(' a\nb\nc');
  });

  test('Tab nests a task under the top-level task above it at its level', () => {
    expect(taskNestIndent([P, S], 1)).toBe(2);
    expect(taskNestIndent([P, '  why', S], 2)).toBe(2);
    expect(taskNestIndent(['text', S], 1)).toBeNull();
    expect(taskNestIndent([P, '', S], 2)).toBeNull();
    expect(taskNestIndent([P, '  ', '  ' + S], 2)).toBeNull();
  });

  test('Tab under a subtask does not nest deeper', () => {
    expect(taskNestIndent([P, `  ${S}`, `  ${T}`], 2)).toBeNull();
  });

  test('a drop under a top-level task makes a subtask; under a subtask, a sibling', () => {
    expect(taskDropNestIndent([P, T], 0)).toBe(2);
    expect(taskDropNestIndent([P, `  ${S}`, T], 1)).toBe(2);
    expect(taskDropNestIndent(['text', T], 0)).toBeNull();
    expect(taskDropNestIndent([T], -1)).toBeNull();
    expect(taskDropNestIndent(['```', P, '```', T], 1)).toBeNull();
  });

  test('the line after a subtask’s outer block is after its parent’s block, which a blank line ends', () => {
    const lines = ['a', P, `  ${S}`, '    why', `  ${T}`, 'after', '', '  x'];
    expect(lineAfterOuterBlock(lines, 1)).toBe(5);
    expect(lineAfterOuterBlock(lines, 2)).toBe(5);
    expect(lineAfterOuterBlock(lines, 3)).toBe(5);
    expect(lineAfterOuterBlock(lines, 5)).toBe(6);
    expect(lineAfterOuterBlock(lines, 7)).toBe(8);
  });

  test('a new line at the end of a parent or subtask row goes after the whole block', () => {
    const lines = [P, `  ${S}`, `  ${T}`, 'after'];
    expect(insertAfterTaskBlock(lines, 0, '\nCall hotel')).toEqual({
      lines: [P, `  ${S}`, `  ${T}`, 'Call hotel', 'after'],
      line: 3,
      column: 10,
    });
    expect(insertAfterTaskBlock(lines, 1, 'one\ntwo').lines).toEqual([
      P,
      `  ${S}`,
      `  ${T}`,
      'one',
      'two',
      'after',
    ]);
  });
});

describe('addMovedTaskBlock', () => {
  const A = '01JTASKAAAAAAAAAAAAAAAAAAA';
  const block = `${P}\n  ${S}\n  budget is 40k`;

  test('appends the block after the note text', () => {
    expect(addMovedTaskBlock('agenda\n', A, block)).toBe(
      `agenda\n\n${block}\n\n`,
    );
  });

  test('leaves out tasks the note already embeds', () => {
    expect(addMovedTaskBlock(`${S}`, A, block)).toBe(
      `${S}\n\n${P}\n  budget is 40k\n\n`,
    );
  });

  test('puts the lines the note lacks under the task it already embeds', () => {
    const day = `## Carried in\n\n${P}\n  older note\n\nend`;
    expect(addMovedTaskBlock(day, A, block)).toBe(
      `## Carried in\n\n${P}\n  older note\n  ${S}\n  budget is 40k\n\nend`,
    );
  });

  test('matches the indent of the task line already in the note', () => {
    expect(addMovedTaskBlock(`${T}\n  ${P}\nend`, A, `${P}\n  notes`)).toBe(
      `${T}\n  ${P}\n    notes\nend`,
    );
  });

  test('is null when the note already holds every line of the block', () => {
    expect(addMovedTaskBlock(`agenda\n\n${block}\n\n`, A, block)).toBeNull();
    expect(addMovedTaskBlock(`${P}\n  x`, A, P)).toBeNull();
  });
});

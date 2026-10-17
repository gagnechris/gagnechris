import { describe, expect, test } from 'vitest';
import {
  insertAfterTaskBlock,
  lineAfterOuterBlock,
  markdownItemBlock,
  noteHeadings,
  reindent,
  removeTaskEmbedLines,
  removeTaskLine,
  sectionEnd,
  taskDropNestIndent,
  taskNestIndent,
} from './task-blocks.js';

const ID = {
  P: '01JTASKAAAAAAAAAAAAAAAAAAA',
  S: '01JTASKBBBBBBBBBBBBBBBBBBB',
};
const P = `{{task:${ID.P}}}`;
const S = `{{task:${ID.S}}}`;
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
    expect(taskDropNestIndent([P, T], 0, 1)).toBe(2);
    expect(taskDropNestIndent([P, `  ${S}`, T], 1, 2)).toBe(2);
    expect(taskDropNestIndent(['text', T], 0, 1)).toBeNull();
    expect(taskDropNestIndent([T], -1, 0)).toBeNull();
    expect(taskDropNestIndent(['```', P, '```', T], 1, 3)).toBeNull();
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

  test('removing a parent’s line moves its subtasks and their lines out to its level', () => {
    expect(removeTaskLine([T, P, `  ${S}`, '    why', 'after'], 1)).toEqual([
      T,
      S,
      '  why',
      'after',
    ]);
    expect(removeTaskLine([P, `  ${S}`, `  ${T}`], 1)).toEqual([P, `  ${T}`]);
  });

  test('a task deleted elsewhere leaves the note without re-parenting its subtasks', () => {
    const md = ['Plan', T, P, `  ${S}`, 'end'].join('\n');
    expect(removeTaskEmbedLines(md, new Set([ID.P]))).toBe(
      ['Plan', T, S, 'end'].join('\n'),
    );
    expect(removeTaskEmbedLines(md, new Set([ID.P, ID.S]))).toBe(
      ['Plan', T, 'end'].join('\n'),
    );
  });

  test('a token inside a code fence is not a task line', () => {
    const md = ['```', P, '```', P].join('\n');
    expect(removeTaskEmbedLines(md, new Set([ID.P]))).toBe(
      ['```', P, '```'].join('\n'),
    );
  });

  test('a task with subtasks does not nest, by Tab or by a drop, so they keep their parent', () => {
    expect(taskNestIndent([P, T, `  ${S}`], 1)).toBeNull();
    expect(taskDropNestIndent([P, T, `  ${S}`], 0, 1)).toBeNull();
    expect(taskNestIndent([P, T, '  why'], 1)).toBe(2);
    expect(taskDropNestIndent([P, T, '  why'], 0, 1)).toBe(2);
  });
});

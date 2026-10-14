import { describe, expect, test } from 'vitest';
import {
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
});

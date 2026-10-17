import { describe, expect, test } from 'vitest';
import { taskCheckboxAction } from './schemas.js';
import { oneLineTaskTitle } from './task-line.js';

describe('task titles and boxes', () => {
  test('a pasted title loses its line breaks', () => {
    expect(oneLineTaskTitle('Ship it\n  to staging\r\nthen prod')).toBe(
      'Ship it to staging then prod',
    );
    expect(oneLineTaskTitle('One line')).toBe('One line');
    expect(oneLineTaskTitle(' keep  edges ')).toBe(' keep  edges ');
    expect(oneLineTaskTitle('a \n \n\n  b')).toBe('a b');
    expect(oneLineTaskTitle('\n  lead')).toBe(' lead');
    expect(oneLineTaskTitle('trail  \n')).toBe('trail ');
    expect(oneLineTaskTitle('\n \n')).toBe(' ');
  });

  test('matches the one-regex rule on any mix of spaces and breaks', () => {
    const chars = [' ', '\n', '\r', '\t', 'x'];
    for (let n = 0; n < 4000; n += 1) {
      let text = '';
      for (let k = n; k > 0; k = Math.floor(k / 5)) text += chars[k % 5];
      expect(oneLineTaskTitle(text)).toBe(text.replace(/\s*\n\s*/g, ' '));
    }
  });

  test('stays fast on a long run of spaces', () => {
    const text = `a${' '.repeat(100_000)}b\nc`;
    const started = performance.now();
    expect(oneLineTaskTitle(text)).toBe(`a${' '.repeat(100_000)}b c`);
    expect(performance.now() - started).toBeLessThan(200);
  });

  test('a done task reopens from its box; any other completes', () => {
    expect(taskCheckboxAction('done')).toBe('reopen');
    expect(taskCheckboxAction('dropped')).toBe('complete');
    expect(taskCheckboxAction('todo')).toBe('complete');
    expect(taskCheckboxAction('in_progress')).toBe('complete');
  });
});

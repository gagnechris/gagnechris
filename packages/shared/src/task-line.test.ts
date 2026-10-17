import { describe, expect, test } from 'vitest';
import { taskCheckboxAction } from './schemas.js';
import { oneLineTaskTitle } from './task-line.js';

describe('task titles and boxes', () => {
  test('a pasted title loses its line breaks', () => {
    expect(oneLineTaskTitle('Ship it\n  to staging\r\nthen prod')).toBe(
      'Ship it to staging then prod',
    );
    expect(oneLineTaskTitle('One line')).toBe('One line');
  });

  test('a done task reopens from its box; any other completes', () => {
    expect(taskCheckboxAction('done')).toBe('reopen');
    expect(taskCheckboxAction('dropped')).toBe('complete');
    expect(taskCheckboxAction('todo')).toBe('complete');
    expect(taskCheckboxAction('in_progress')).toBe('complete');
  });
});

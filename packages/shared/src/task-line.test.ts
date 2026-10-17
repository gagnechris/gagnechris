import { describe, expect, test } from 'vitest';
import {
  bulletCheckboxAsTask,
  typedBulletCheckboxAsTask,
} from './task-line.js';

describe('bulletCheckboxAsTask', () => {
  test.each([
    ['- [ ]', '[ ]'],
    ['* [ ]', '[ ]'],
    ['+ [ ]', '[ ]'],
    ['  - [ ]', '  [ ]'],
    ['\t-  [ ]', '\t[ ]'],
  ])('%j becomes %j', (line, task) => {
    expect(bulletCheckboxAsTask(line)).toBe(task);
  });

  test.each(['- [x]', '[ ]', '- note [ ]', '1. [ ]', '- [ ] a', '-[ ]'])(
    '%j is left alone',
    (line) => {
      expect(bulletCheckboxAsTask(line)).toBeNull();
    },
  );
});

describe('typedBulletCheckboxAsTask', () => {
  test('the typed ] turns the bullet into a task line, text after the caret kept', () => {
    const before = '## Focus\n  - [  Buy milk\nend';
    const after = '## Focus\n  - [ ] Buy milk\nend';
    const caret = after.indexOf(']') + 1;
    expect(typedBulletCheckboxAsTask(before, after, caret)).toEqual({
      text: '## Focus\n  [ ] Buy milk\nend',
      caret: '## Focus\n  [ ]'.length,
    });
  });

  test('anything but one typed ] is left alone', () => {
    expect(typedBulletCheckboxAsTask('- [ ', '- [ ]', 5)).toEqual({
      text: '[ ]',
      caret: 3,
    });
    expect(typedBulletCheckboxAsTask('', '- [ ]', 5)).toBeNull();
    expect(typedBulletCheckboxAsTask('- [ ', '- [ x', 5)).toBeNull();
    expect(typedBulletCheckboxAsTask('- [ (url)', '- [ ](url)', 5)).toBeNull();
    expect(typedBulletCheckboxAsTask('- [x', '- [x]', 5)).toBeNull();
  });
});

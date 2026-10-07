import { describe, expect, test } from 'vitest';
import { fenceLineKind, scanFences } from './markdown-fences.js';

describe('scanFences', () => {
  test('pairs openers and closers by character and length', () => {
    const lines = [
      'text',
      '```js',
      '~~~',
      '``',
      '````',
      'after',
      '  ~~~~',
      'code',
      '~~~',
      '~~~~',
      'after',
    ];
    const blocks = scanFences(lines);
    expect(blocks).toEqual([
      { open: 1, close: 4 },
      { open: 6, close: 9 },
    ]);
    expect(lines.map((_, i) => fenceLineKind(blocks, i))).toEqual([
      null,
      'fence',
      'code',
      'code',
      'fence',
      null,
      'fence',
      'code',
      'code',
      'fence',
      null,
    ]);
  });

  test('an unclosed fence runs to the end; four-space indents are not fences', () => {
    const blocks = scanFences(['    ```', 'a', '```', 'b']);
    expect(blocks).toEqual([{ open: 2, close: null }]);
    expect([0, 1, 2, 3].map((i) => fenceLineKind(blocks, i))).toEqual([
      null,
      null,
      'fence',
      'code',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { deepEqual } from '../src/deep-equal.js';

describe('deepEqual', () => {
  it('treats reordered object keys as equal', () => {
    expect(
      deepEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }),
    ).toBe(true);
  });

  it('compares arrays by index order', () => {
    expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(deepEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('distinguishes nested value differences', () => {
    expect(deepEqual({ seo: { title: 'A' } }, { seo: { title: 'B' } })).toBe(
      false,
    );
  });
});

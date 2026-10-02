import { describe, expect, it } from 'vitest';
import {
  normalizeTags,
  postPk,
  slugify,
  slugPk,
  statusGsi1Pk,
} from '@gagnechris/data';

describe('post keys (single-table prefixes)', () => {
  it('uses POST# / SLUG# / STATUS# prefixes only', () => {
    expect(postPk('01ABC')).toBe('POST#01ABC');
    expect(slugPk('hello')).toBe('SLUG#hello');
    expect(statusGsi1Pk('draft')).toBe('STATUS#draft');
  });

  it('slugifies titles', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  ')).toBe('untitled');
    expect(slugify('  Café  ')).toBe('cafe');
  });

  it('normalizes tags', () => {
    expect(normalizeTags(['  Foo Bar ', 'foo-bar', 'BAZ'])).toEqual([
      'foo-bar',
      'baz',
    ]);
  });
});

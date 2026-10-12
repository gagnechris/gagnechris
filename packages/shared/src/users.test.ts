import { describe, expect, test } from 'vitest';
import { initials } from './users.js';

describe('initials', () => {
  test('uses the first and last word of a name', () => {
    expect(initials('Mary Jane Smith')).toBe('MS');
    expect(initials('Sam Rivera')).toBe('SR');
  });

  test('uses the first two letters of a single word', () => {
    expect(initials('Chris')).toBe('CH');
    expect(initials('  _chris ')).toBe('CH');
  });

  test('reads an email up to the @', () => {
    expect(initials('jordan.lee@example.com')).toBe('JL');
    expect(initials('alex@example.com')).toBe('AL');
  });

  test('falls back to a question mark', () => {
    expect(initials('')).toBe('?');
    expect(initials('@example.com')).toBe('?');
  });
});

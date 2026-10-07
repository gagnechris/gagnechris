import { describe, expect, test } from 'vitest';
import { stubClipboard, stubShare } from './test-utils';

describe('bears test harness', () => {
  test('stubs the clipboard and Web Share for one test', () => {
    stubClipboard();
    stubShare(async () => undefined);
    expect(navigator.clipboard).toBeDefined();
    expect(typeof navigator.share).toBe('function');
  });

  test('does not leak them into the next test', () => {
    expect(navigator.clipboard).toBeUndefined();
    expect('share' in navigator).toBe(false);
    expect('canShare' in navigator).toBe(false);
  });
});

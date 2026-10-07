import { describe, expect, test } from 'vitest';
import { ApiError } from '@gagnechris/app-core';
import { newestById } from '@gagnechris/shared';
import { taskActionError } from './taskActionError';

describe('taskActionError', () => {
  test('a version conflict says to reload; anything else to try again', () => {
    expect(taskActionError('snooze', 'Call Sam', new ApiError('x', 409))).toBe(
      'Could not snooze “Call Sam”: it changed on another device. Reload and try again.',
    );
    expect(taskActionError('complete', 'Call Sam', new TypeError())).toBe(
      'Could not complete “Call Sam”. Please try again.',
    );
  });
});

describe('newestById', () => {
  test('keeps the highest version of each id, in first-seen order', () => {
    const byId = newestById([
      { id: 'a', version: 2 },
      { id: 'b', version: 1 },
      { id: 'a', version: 1 },
      { id: 'b', version: 3 },
    ]);
    expect([...byId.values()]).toEqual([
      { id: 'a', version: 2 },
      { id: 'b', version: 3 },
    ]);
  });
});

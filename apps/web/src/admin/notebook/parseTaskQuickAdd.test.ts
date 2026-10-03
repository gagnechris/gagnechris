import { describe, expect, test } from 'vitest';
import { parseTaskQuickAdd } from './parseTaskQuickAdd';

describe('parseTaskQuickAdd', () => {
  test('parses priority and tomorrow', () => {
    expect(parseTaskQuickAdd('Ship it !high tomorrow', '2026-10-02')).toEqual({
      title: 'Ship it',
      priority: 'high',
      dueDate: '2026-10-03',
    });
  });

  test('parses today and keeps medium priority by default', () => {
    expect(parseTaskQuickAdd('standup today', '2026-10-02')).toEqual({
      title: 'standup',
      priority: 'med',
      dueDate: '2026-10-02',
    });
  });

  test('title-only input', () => {
    expect(parseTaskQuickAdd('  Buy milk  ', '2026-10-02')).toEqual({
      title: 'Buy milk',
      priority: 'med',
      dueDate: null,
    });
  });
});

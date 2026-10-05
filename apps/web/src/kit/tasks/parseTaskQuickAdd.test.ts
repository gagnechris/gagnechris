import { describe, expect, test } from 'vitest';
import { parseTaskQuickAdd } from './parseTaskQuickAdd';

describe('parseTaskQuickAdd', () => {
  test('parses priority and tomorrow', () => {
    expect(parseTaskQuickAdd('Ship it !high tomorrow', '2026-10-02')).toEqual({
      title: 'Ship it',
      priority: 'high',
      startDate: '2026-10-03',
    });
  });

  test('parses today and keeps medium priority by default', () => {
    expect(parseTaskQuickAdd('standup today', '2026-10-02')).toEqual({
      title: 'standup',
      priority: 'med',
      startDate: '2026-10-02',
    });
  });

  test('title-only input', () => {
    expect(parseTaskQuickAdd('  Buy milk  ', '2026-10-02')).toEqual({
      title: 'Buy milk',
      priority: 'med',
      startDate: null,
    });
  });

  test('keeps day words inside a title', () => {
    expect(parseTaskQuickAdd('Plan for Today show', '2026-10-02')).toEqual({
      title: 'Plan for Today show',
      priority: 'med',
      startDate: null,
    });
  });

  test('priority after a trailing due word still parses', () => {
    expect(parseTaskQuickAdd('Ship it tomorrow !high', '2026-10-02')).toEqual({
      title: 'Ship it',
      priority: 'high',
      startDate: '2026-10-03',
    });
  });

  test('a lone due word leaves an empty title', () => {
    expect(parseTaskQuickAdd('tomorrow', '2026-10-02')).toEqual({
      title: '',
      priority: 'med',
      startDate: '2026-10-03',
    });
  });
});

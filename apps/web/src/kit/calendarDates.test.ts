import { describe, expect, test } from 'vitest';
import {
  addLocalDays,
  formatLocalDate,
  monthBounds,
  monthGrid,
  parseLocalDate,
} from './calendarDates';

describe('calendarDates', () => {
  test('parseLocalDate rejects invalid calendar days', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('nope')).toBeNull();
  });

  test('addLocalDays crosses month boundaries in local time', () => {
    expect(addLocalDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('monthBounds covers the full month', () => {
    expect(monthBounds('2026-10-15')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  test('monthGrid pads to full weeks', () => {
    const cells = monthGrid('2026-10-01');
    expect(cells.length % 7).toBe(0);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.includes('2026-10-01')).toBe(true);
    expect(cells.includes('2026-10-31')).toBe(true);
  });

  test('formatLocalDate matches yyyy-mm-dd', () => {
    expect(formatLocalDate(new Date(2026, 9, 2))).toBe('2026-10-02');
  });
});

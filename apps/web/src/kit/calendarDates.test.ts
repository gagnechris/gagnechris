import { describe, expect, test } from 'vitest';
import {
  monthBounds,
  monthGrid,
  monthLabel,
  startOfMonth,
} from './calendarDates';

describe('calendarDates', () => {
  test('monthBounds covers the full month, leap years included', () => {
    expect(monthBounds('2026-10-15')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(monthBounds('2028-02-10').to).toBe('2028-02-29');
  });

  test('monthGrid pads to full weeks from Sunday', () => {
    const cells = monthGrid('2026-10-01');
    expect(cells.length % 7).toBe(0);
    expect(cells.filter(Boolean)).toHaveLength(31);
    // 2026-10-01 is a Thursday.
    expect(cells.indexOf('2026-10-01')).toBe(4);
    expect(cells.includes('2026-10-31')).toBe(true);
    expect(monthGrid('2026-02-30')).toEqual([]);
  });

  test('startOfMonth and monthLabel', () => {
    expect(startOfMonth('2026-10-15')).toBe('2026-10-01');
    expect(monthLabel('2026-10-15')).toBe('October 2026');
  });
});

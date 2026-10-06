import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  daysBetween,
  formatCalendarDay,
  isCalendarDay,
  localDateString,
  MONTH_SHORT,
  parseCalendarDay,
  relativeDayLabel,
  WEEKDAY_SHORT,
  weekdayName,
  weekdayOf,
} from './calendar.js';
import { CalendarDateSchema } from './schemas.js';

// 2026-10-06 is a Tuesday.
const TUE = '2026-10-06';

describe('parseCalendarDay', () => {
  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2025-02-29',
    '2026-1-01',
    'nope',
  ])('rejects %s', (day) => {
    expect(parseCalendarDay(day)).toBeNull();
    expect(isCalendarDay(day)).toBe(false);
  });

  it('accepts real days, leap days and year 0001', () => {
    expect(parseCalendarDay('2028-02-29')?.toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(isCalendarDay('0001-01-01')).toBe(true);
  });
});

describe('CalendarDateSchema', () => {
  it('rejects impossible dates that match yyyy-mm-dd', () => {
    expect(CalendarDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(CalendarDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(CalendarDateSchema.safeParse('2028-02-29').success).toBe(true);
  });
});

describe('day arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-02-30', 1)).toBe('2026-02-30');
  });

  it('counts whole days, signed, across a DST change', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
    expect(daysBetween('2026-02-30', TUE)).toBeNaN();
  });

  it('names weekdays from Sunday', () => {
    expect(WEEKDAY_SHORT).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(MONTH_SHORT[8]).toBe('Sep');
    expect(weekdayOf(TUE)).toBe(2);
    expect(weekdayName(TUE)).toBe('Tue');
    expect(weekdayName(TUE, 'long')).toBe('Tuesday');
  });
});

describe('formatCalendarDay', () => {
  it('formats in English with optional weekday, long month and year', () => {
    expect(formatCalendarDay(TUE)).toBe('Oct 6');
    expect(formatCalendarDay(TUE, { weekday: 'short' })).toBe('Tue, Oct 6');
    expect(
      formatCalendarDay(TUE, { weekday: 'long', month: 'long', year: true }),
    ).toBe('Tuesday, October 6, 2026');
    expect(formatCalendarDay('bad')).toBe('bad');
  });
});

describe('relativeDayLabel', () => {
  it('uses the weekday within six days ahead, else the date', () => {
    expect(relativeDayLabel(TUE, TUE, 'future')).toBe('Tue');
    expect(relativeDayLabel('2026-10-12', TUE, 'future')).toBe('Mon');
    expect(relativeDayLabel('2026-10-13', TUE, 'future')).toBe('Oct 13');
    expect(relativeDayLabel('2026-10-05', TUE, 'future')).toBe('Oct 5');
  });

  it('uses the weekday within six days back, else the date', () => {
    expect(relativeDayLabel('2026-09-30', TUE, 'past')).toBe('Wed');
    expect(relativeDayLabel('2026-09-29', TUE, 'past')).toBe('Sep 29');
    expect(relativeDayLabel('2026-10-07', TUE, 'past')).toBe('Oct 7');
  });

  it('adds the year only when asked and it differs', () => {
    expect(
      relativeDayLabel('2025-09-01', TUE, 'past', { otherYear: true }),
    ).toBe('Sep 1, 2025');
    expect(relativeDayLabel('2025-09-01', TUE, 'past')).toBe('Sep 1');
  });
});

describe('localDateString', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the device calendar day, not the UTC one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 23, 59));
    expect(localDateString()).toBe(TUE);
  });
});

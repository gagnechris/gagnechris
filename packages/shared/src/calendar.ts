/**
 * Calendar days are `yyyy-mm-dd` strings. Arithmetic runs in UTC so a DST
 * change can never skip or repeat a day; names are English (see "Dates and
 * locale" in docs/architecture.md).
 */

export const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAY_SHORT = WEEKDAY_LONG.map((name) => name.slice(0, 3));

export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const MONTH_SHORT = MONTH_LONG.map((name) => name.slice(0, 3));

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export const calendarDay = (year: number, month: number, day: number): string =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** UTC midnight of `day`, or null unless it is a real `yyyy-mm-dd` date. */
export function parseCalendarDay(day: string): Date | null {
  const m = DAY_SHAPE.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export const isCalendarDay = (day: string): boolean =>
  parseCalendarDay(day) !== null;

const fromUtc = (date: Date) =>
  calendarDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

/** The device's calendar day for `date`, not the UTC one. */
export function localDateString(date: Date = new Date()): string {
  return calendarDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Unchanged when `day` is not a calendar day. */
export function addDays(day: string, delta: number): string {
  const date = parseCalendarDay(day);
  if (!date) return day;
  date.setUTCDate(date.getUTCDate() + delta);
  return fromUtc(date);
}

/** Whole days from `from` to `to`; NaN when either is not a calendar day. */
export function daysBetween(from: string, to: string): number {
  const a = parseCalendarDay(from);
  const b = parseCalendarDay(to);
  if (!a || !b) return Number.NaN;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day: string): number | null =>
  parseCalendarDay(day)?.getUTCDay() ?? null;

/** `Tue` or `Tuesday`; `day` as is when invalid. */
export function weekdayName(
  day: string,
  style: 'short' | 'long' = 'short',
): string {
  const weekday = weekdayOf(day);
  if (weekday === null) return day;
  return (style === 'long' ? WEEKDAY_LONG : WEEKDAY_SHORT)[weekday]!;
}

export type CalendarDayFormat = {
  weekday?: 'short' | 'long';
  month?: 'short' | 'long';
  year?: boolean;
};

/** `Oct 6`, `Tue, Oct 6`, `Tuesday, October 6, 2026`; `day` as is when invalid. */
export function formatCalendarDay(
  day: string,
  { weekday, month = 'short', year = false }: CalendarDayFormat = {},
): string {
  const date = parseCalendarDay(day);
  if (!date) return day;
  const names = month === 'long' ? MONTH_LONG : MONTH_SHORT;
  let text = `${names[date.getUTCMonth()]} ${date.getUTCDate()}`;
  if (year) text += `, ${date.getUTCFullYear()}`;
  if (weekday) {
    const days = weekday === 'long' ? WEEKDAY_LONG : WEEKDAY_SHORT;
    text = `${days[date.getUTCDay()]}, ${text}`;
  }
  return text;
}

/**
 * `Thu` when `day` falls within six days of `today` on the given side
 * (today included), else `Oct 12` (`Oct 12, 2025` with `otherYear` when the
 * year differs from today's).
 */
export function relativeDayLabel(
  day: string,
  today: string,
  side: 'past' | 'future',
  { otherYear = false }: { otherYear?: boolean } = {},
): string {
  const n = daysBetween(today, day);
  const near = side === 'past' ? n <= 0 && n > -7 : n >= 0 && n < 7;
  if (near) return weekdayName(day);
  return formatCalendarDay(day, {
    year: otherYear && day.slice(0, 4) !== today.slice(0, 4),
  });
}

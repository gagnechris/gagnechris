import {
  addDays,
  calendarDay,
  localDateString,
  MONTH_LONG,
  parseCalendarDay,
  weekdayOf,
} from '@gagnechris/shared';

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export function startOfMonth(value: string): string {
  return parseCalendarDay(value) ? `${value.slice(0, 7)}-01` : value;
}

export function monthBounds(value: string): { from: string; to: string } {
  const date = parseCalendarDay(value);
  if (!date) {
    const today = localDateString();
    return { from: today, to: today };
  }
  const [year, month] = [date.getUTCFullYear(), date.getUTCMonth() + 1];
  return {
    from: calendarDay(year, month, 1),
    to: calendarDay(year, month, daysInMonth(year, month)),
  };
}

/** Sunday-start month grid cells (null = padding). */
export function monthGrid(value: string): (string | null)[] {
  const { from, to } = monthBounds(value);
  if (!parseCalendarDay(value)) return [];
  const cells: (string | null)[] = Array.from(
    { length: weekdayOf(from)! },
    () => null,
  );
  for (let day = from; day <= to; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function monthLabel(value: string): string {
  const date = parseCalendarDay(value);
  if (!date) return value;
  return `${MONTH_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

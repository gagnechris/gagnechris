import { addDays, isCalendarDay, relativeDayLabel } from '@gagnechris/shared';

/** `@Tue` within the coming week, else `@Oct 12`; undefined when unscheduled. */
export function taskScheduleLabel(
  date: string | null,
  today: string,
  someday = false,
): string | undefined {
  if (someday) return '@someday';
  if (!date || !isCalendarDay(date)) return undefined;
  if (date === today) return '@today';
  if (date === addDays(today, 1)) return '@tomorrow';
  return `@${relativeDayLabel(date, today, 'future')}`;
}

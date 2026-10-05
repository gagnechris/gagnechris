import { addLocalDays, parseLocalDate } from '../calendarDates';

/** `@Tue` within the coming week, else `@Oct 12`; undefined when unscheduled. */
export function taskScheduleLabel(
  date: string | null,
  today: string,
  someday = false,
): string | undefined {
  if (someday) return '@someday';
  const parsed = date ? parseLocalDate(date) : null;
  if (!date || !parsed) return undefined;
  if (date === today) return '@today';
  if (date === addLocalDays(today, 1)) return '@tomorrow';
  if (date > today && date < addLocalDays(today, 7)) {
    return `@${parsed.toLocaleDateString('en-US', { weekday: 'short' })}`;
  }
  return `@${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

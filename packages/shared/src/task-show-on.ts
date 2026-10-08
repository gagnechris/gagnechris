import { addDays, weekdayOf } from './calendar.js';
import type { Task } from './schemas.js';

export const TASK_SHOW_ON_FILTERS = [
  '',
  'earlier',
  'today',
  'week',
  'later',
  'none',
  'someday',
] as const;

export type TaskShowOnFilter = (typeof TASK_SHOW_ON_FILTERS)[number];

export const TASK_SHOW_ON_LABELS: Record<TaskShowOnFilter, string> = {
  '': 'Any',
  earlier: 'Before today',
  today: 'Today',
  week: 'This week',
  later: 'After today',
  none: 'No date',
  someday: 'Someday',
};

export const taskShowOnParam = (value: string | null): TaskShowOnFilter =>
  TASK_SHOW_ON_FILTERS.find((f) => f === value) ?? '';

function endOfLocalWeek(today: string): string {
  const day = weekdayOf(today);
  if (day === null) return today;
  // Sunday = 0 … Saturday = 6; inclusive end of this calendar week (Sat).
  return addDays(today, day === 0 ? 6 : 6 - day);
}

export function matchesTaskShowOn(
  task: Pick<Task, 'someday' | 'startDate'>,
  showOn: TaskShowOnFilter,
  today: string,
): boolean {
  if (!showOn) return true;
  if (showOn === 'someday') return task.someday;
  if (task.someday) return false;
  if (showOn === 'none') return task.startDate === null;
  if (showOn === 'later') {
    return task.startDate !== null && task.startDate > today;
  }
  if (showOn === 'today') return task.startDate === today;
  if (showOn === 'earlier') {
    return task.startDate !== null && task.startDate < today;
  }
  if (showOn === 'week') {
    if (!task.startDate) return false;
    return task.startDate >= today && task.startDate <= endOfLocalWeek(today);
  }
  return true;
}

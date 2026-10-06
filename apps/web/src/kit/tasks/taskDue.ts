import { formatTaskDay, isOpenTaskStatus, type Task } from '@gagnechris/shared';
import { addLocalDays } from '../calendarDates';

export type TaskDue = {
  text: string;
  /** The full date, for the pill's tooltip. */
  title: string;
  overdue: boolean;
};

/**
 * `due Thu` within the coming week, else `due Oct 30`; `Overdue · Mon` once
 * passed. Null when there is no deadline or the task is closed.
 */
export function taskDue(
  task: Pick<Task, 'dueDate' | 'status'>,
  today: string,
): TaskDue | null {
  const { dueDate } = task;
  if (!dueDate || !isOpenTaskStatus(task.status)) return null;
  const full = formatTaskDay(dueDate);
  const weekday = full.slice(0, 3);
  const monthDay = formatTaskDay(dueDate, false);
  if (dueDate < today) {
    const short = dueDate > addLocalDays(today, -7) ? weekday : monthDay;
    return {
      text: `Overdue · ${short}`,
      title: `Overdue, was due ${full}`,
      overdue: true,
    };
  }
  if (dueDate === today) {
    return { text: 'due today', title: `Due today, ${full}`, overdue: false };
  }
  const short = dueDate < addLocalDays(today, 7) ? weekday : monthDay;
  return { text: `due ${short}`, title: `Due ${full}`, overdue: false };
}

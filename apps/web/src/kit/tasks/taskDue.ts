import {
  formatTaskDay,
  isOpenTaskStatus,
  relativeDayLabel,
  type Task,
} from '@gagnechris/shared';

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
  if (dueDate < today) {
    return {
      text: `Overdue · ${relativeDayLabel(dueDate, today, 'past')}`,
      title: `Overdue, was due ${full}`,
      overdue: true,
    };
  }
  if (dueDate === today) {
    return { text: 'due today', title: `Due today, ${full}`, overdue: false };
  }
  return {
    text: `due ${relativeDayLabel(dueDate, today, 'future')}`,
    title: `Due ${full}`,
    overdue: false,
  };
}

import { isOpenTaskStatus, type Task, type TaskPriority } from './schemas.js';

type ListedTask = Pick<
  Task,
  'id' | 'status' | 'priority' | 'startDate' | 'someday' | 'dueDate'
>;

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 };

/** An open task's deadline once it is today or past, else null. */
const dueBy = (task: ListedTask, today: string) =>
  isOpenTaskStatus(task.status) &&
  task.dueDate !== null &&
  task.dueDate <= today
    ? task.dueDate
    : null;

/**
 * Tasks list order: overdue and due-today first (earliest deadline first),
 * then by show-on date, then undated, then Someday; priority, then id.
 */
export function compareTasksForList(
  a: ListedTask,
  b: ListedTask,
  today: string,
): number {
  const [dueA, dueB] = [dueBy(a, today), dueBy(b, today)];
  if (dueA !== dueB) {
    if (dueA === null) return 1;
    if (dueB === null) return -1;
    return dueA < dueB ? -1 : 1;
  }
  if (a.someday !== b.someday) return a.someday ? 1 : -1;
  if (a.startDate !== b.startDate) {
    if (a.startDate === null) return 1;
    if (b.startDate === null) return -1;
    return a.startDate < b.startDate ? -1 : 1;
  }
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.id.localeCompare(b.id)
  );
}

export const sortTasksForList = <T extends ListedTask>(
  tasks: readonly T[],
  today: string,
): T[] => [...tasks].sort((a, b) => compareTasksForList(a, b, today));

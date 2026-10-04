import type { Task } from '@gagnechris/shared';
import { addLocalDays } from '../calendarDates';

type BucketTask = Pick<Task, 'deleted' | 'dueDate' | 'status'>;

export type TodayTaskBuckets<T extends BucketTask = BucketTask> = {
  overdue: T[];
  dueToday: T[];
  inProgress: T[];
  doneToday: T[];
  tomorrow: T[];
};

export function bucketTodayTasks<T extends BucketTask>(
  tasks: T[],
  today: string,
): TodayTaskBuckets<T> {
  const tomorrow = addLocalDays(today, 1);
  const overdue: T[] = [];
  const dueToday: T[] = [];
  const inProgress: T[] = [];
  const doneToday: T[] = [];
  const tomorrowTasks: T[] = [];

  for (const task of tasks) {
    if (task.deleted) continue;

    if (task.dueDate === tomorrow && task.status !== 'done') {
      tomorrowTasks.push(task);
    }

    if (task.dueDate === today && task.status === 'done') {
      doneToday.push(task);
      continue;
    }

    if (task.status === 'done') continue;

    if (task.dueDate !== null && task.dueDate < today) {
      overdue.push(task);
      continue;
    }

    if (task.dueDate === today) {
      dueToday.push(task);
      continue;
    }

    if (task.status === 'in_progress') {
      inProgress.push(task);
    }
  }

  return {
    overdue,
    dueToday,
    inProgress,
    doneToday,
    tomorrow: tomorrowTasks,
  };
}

export function showTomorrowPreview(
  now: Date = new Date(),
  hour = 18,
): boolean {
  return now.getHours() >= hour;
}

export function todayProgress(buckets: TodayTaskBuckets): {
  done: number;
  total: number;
} {
  const done = buckets.doneToday.length;
  const total = done + buckets.dueToday.length;
  return { done, total };
}

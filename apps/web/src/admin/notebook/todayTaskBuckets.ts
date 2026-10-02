import type { Task } from '@gagnechris/app-core';
import { addLocalDays } from './calendarDates';

export type TodayTaskBuckets = {
  overdue: Task[];
  dueToday: Task[];
  inProgress: Task[];
  doneToday: Task[];
  tomorrow: Task[];
};

/** Partition open/done tasks for the Today dashboard (CHR-45). */
export function bucketTodayTasks(
  tasks: Task[],
  today: string,
): TodayTaskBuckets {
  const tomorrow = addLocalDays(today, 1);
  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const inProgress: Task[] = [];
  const doneToday: Task[] = [];
  const tomorrowTasks: Task[] = [];

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

/** Show tomorrow preview at/after 18:00 local time. */
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

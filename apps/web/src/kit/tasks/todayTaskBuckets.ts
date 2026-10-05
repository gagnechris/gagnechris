import type { Task } from '@gagnechris/shared';
import { addLocalDays } from '../calendarDates';

type BucketTask = Pick<Task, 'deleted' | 'startDate' | 'someday' | 'status'>;

export type TodayTaskBuckets<T extends BucketTask = BucketTask> = {
  carriedOver: T[];
  startsToday: T[];
  inProgress: T[];
  doneToday: T[];
  tomorrow: T[];
};

export function bucketTodayTasks<T extends BucketTask>(
  tasks: T[],
  today: string,
): TodayTaskBuckets<T> {
  const tomorrow = addLocalDays(today, 1);
  const carriedOver: T[] = [];
  const startsToday: T[] = [];
  const inProgress: T[] = [];
  const doneToday: T[] = [];
  const tomorrowTasks: T[] = [];

  for (const task of tasks) {
    if (task.deleted || task.someday) continue;

    if (task.startDate === tomorrow && task.status !== 'done') {
      tomorrowTasks.push(task);
    }

    if (task.startDate === today && task.status === 'done') {
      doneToday.push(task);
      continue;
    }

    if (task.status === 'done') continue;

    if (task.startDate !== null && task.startDate < today) {
      carriedOver.push(task);
      continue;
    }

    if (task.startDate === today) {
      startsToday.push(task);
      continue;
    }

    if (task.status === 'in_progress') {
      inProgress.push(task);
      continue;
    }

    // A null startDate means now.
    if (task.startDate === null) startsToday.push(task);
  }

  return {
    carriedOver,
    startsToday,
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
  const total = done + buckets.startsToday.length;
  return { done, total };
}

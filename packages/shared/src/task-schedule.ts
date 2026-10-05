import type { Task } from './schemas.js';

type ScheduledTask = Pick<Task, 'startDate' | 'someday'>;

export type TaskScheduleFilter = {
  startOn?: string;
  startOnOrBefore?: string;
  startAfter?: string;
  someday?: boolean;
};

/** Today's rule: a null startDate means now; someday tasks never show. */
export function taskShowsOn(task: ScheduledTask, day: string): boolean {
  return !task.someday && (task.startDate === null || task.startDate <= day);
}

export function taskStartsAfter(task: ScheduledTask, day: string): boolean {
  return !task.someday && task.startDate !== null && task.startDate > day;
}

export function taskMatchesSchedule(
  task: ScheduledTask,
  filter: TaskScheduleFilter,
): boolean {
  if (filter.someday !== undefined && filter.someday !== task.someday) {
    return false;
  }
  if (filter.startOn !== undefined && task.startDate !== filter.startOn) {
    return false;
  }
  if (
    filter.startOnOrBefore !== undefined &&
    !taskShowsOn(task, filter.startOnOrBefore)
  ) {
    return false;
  }
  if (
    filter.startAfter !== undefined &&
    !taskStartsAfter(task, filter.startAfter)
  ) {
    return false;
  }
  return true;
}

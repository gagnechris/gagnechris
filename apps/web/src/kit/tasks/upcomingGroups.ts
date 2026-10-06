import {
  addDays,
  formatTaskDay,
  isOpenTaskStatus,
  type Task,
  weekdayName,
} from '@gagnechris/shared';
import type { SourceNote } from './todayTaskBuckets';

export type UpcomingTask = Pick<
  Task,
  'id' | 'version' | 'deleted' | 'status' | 'startDate' | 'someday' | 'title'
>;

export type UpcomingGroup<T> = {
  key: string;
  label: string;
  sub: string;
  /** Later rows span many days, so each shows its date. */
  datedRows: boolean;
  tasks: T[];
};

/** Days after `day` that get their own group; anything later is Later. */
const WEEK_DAYS = 6;

/**
 * Open tasks that start after `day` or are parked: Tomorrow, each day of the
 * coming week, Later, Someday. Each task lands once; empty groups are dropped.
 */
export function groupUpcomingTasks<T extends UpcomingTask>(
  tasks: Iterable<T>,
  day: string,
): UpcomingGroup<T>[] {
  const byId = new Map<string, T>();
  for (const task of tasks) {
    const seen = byId.get(task.id);
    if (!seen || task.version > seen.version) byId.set(task.id, task);
  }

  const groups: UpcomingGroup<T>[] = [];
  for (let n = 1; n <= WEEK_DAYS; n++) {
    const date = addDays(day, n);
    groups.push({
      key: date,
      label: n === 1 ? 'Tomorrow' : weekdayName(date, 'long'),
      sub: formatTaskDay(date, n === 1),
      datedRows: false,
      tasks: [],
    });
  }
  const laterFrom = addDays(day, WEEK_DAYS + 1);
  const later: UpcomingGroup<T> = {
    key: 'later',
    label: 'Later',
    sub: `${formatTaskDay(laterFrom, false)} and beyond`,
    datedRows: true,
    tasks: [],
  };
  const someday: UpcomingGroup<T> = {
    key: 'someday',
    label: 'Someday',
    sub: 'Parked, no date',
    datedRows: false,
    tasks: [],
  };

  const sorted = [...byId.values()]
    .filter((t) => !t.deleted && isOpenTaskStatus(t.status))
    .sort(
      (a, b) =>
        (a.startDate ?? '').localeCompare(b.startDate ?? '') ||
        a.title.localeCompare(b.title),
    );
  for (const task of sorted) {
    if (task.someday) {
      someday.tasks.push(task);
    } else if (task.startDate && task.startDate > day) {
      if (task.startDate >= laterFrom) later.tasks.push(task);
      else groups.find((g) => g.key === task.startDate)?.tasks.push(task);
    }
  }
  return [...groups, later, someday].filter((g) => g.tasks.length > 0);
}

/** The source chip: `Fri, Oct 2 note` for a daily, else the page title. */
export function noteChipLabel(note: SourceNote): string {
  if (note.type === 'daily' && note.date) {
    return `${formatTaskDay(note.date)} note`;
  }
  return note.title.trim() || 'Untitled note';
}

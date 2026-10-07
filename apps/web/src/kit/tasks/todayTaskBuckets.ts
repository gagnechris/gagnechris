import {
  addDays,
  daysBetween,
  formatTaskDay,
  isOpenTaskStatus,
  localDayOf,
  type Note,
  relativeDayLabel,
  type Task,
  taskShowsOn,
} from '@gagnechris/shared';
import { newestById } from './newestById';

export const COMING_UP_DAYS = 14;

export type BucketTask = Pick<
  Task,
  | 'id'
  | 'version'
  | 'deleted'
  | 'status'
  | 'startDate'
  | 'someday'
  | 'dueDate'
  | 'createdAt'
>;

export type ComingUpDay<T> = { date: string; tasks: T[] };

export type TodayTaskBuckets<T> = {
  /** Open tasks the day's note embeds; the note renders them. */
  inNote: T[];
  /** Open, showing on the day (start on or before it, or none), not in the note; overdue first. */
  stillOpen: T[];
  /** Open, starting within the horizon after the day, not in the note; by day. */
  comingUp: ComingUpDay<T>[];
  /** Open tasks showing on the day, in the note or not: they show tomorrow too. */
  carryCount: number;
};

/**
 * Splits tasks so each lands in at most one place on Today. Carry-forward is
 * this computation: nothing is copied when the day changes.
 */
export function bucketTodayTasks<T extends BucketTask>(
  tasks: Iterable<T>,
  {
    day,
    embeddedIds,
    horizonDays = COMING_UP_DAYS,
  }: {
    day: string;
    embeddedIds: ReadonlySet<string>;
    horizonDays?: number;
  },
): TodayTaskBuckets<T> {
  const byId = newestById(tasks);

  const horizon = addDays(day, horizonDays);
  const inNote: T[] = [];
  const stillOpen: T[] = [];
  const upcoming = new Map<string, T[]>();
  let carryCount = 0;

  for (const task of byId.values()) {
    if (task.deleted || !isOpenTaskStatus(task.status)) continue;
    const showsToday = taskShowsOn(task, day);
    if (showsToday) carryCount += 1;
    if (embeddedIds.has(task.id)) {
      inNote.push(task);
      continue;
    }
    if (showsToday) {
      stillOpen.push(task);
      continue;
    }
    const start = task.startDate;
    if (!task.someday && start !== null && start > day && start <= horizon) {
      const list = upcoming.get(start) ?? [];
      list.push(task);
      upcoming.set(start, list);
    }
  }

  const sinceKey = (t: T) => t.startDate ?? localDayOf(t.createdAt);
  const overdue = (t: T) =>
    t.dueDate !== null && t.dueDate < day ? t.dueDate : null;
  const byOverdue = (a: T, b: T) => {
    const [x, y] = [overdue(a), overdue(b)];
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  };
  stillOpen.sort(
    (a, b) =>
      byOverdue(a, b) ||
      sinceKey(a).localeCompare(sinceKey(b)) ||
      a.id.localeCompare(b.id),
  );
  const comingUp = [...upcoming.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      tasks: list.sort((a, b) => a.id.localeCompare(b.id)),
    }));

  return { inNote, stillOpen, comingUp, carryCount };
}

const age = (since: string, day: string) => {
  const n = daysBetween(since, day);
  if (n <= 0) return 'today';
  return n === 1 ? '1 day' : `${n} days`;
};

export type SourceNote = Pick<Note, 'id' | 'type' | 'date' | 'title'>;

export type StillOpenSource = {
  label: string;
  /** Where the task came from; null for a task written outside a note. */
  noteId: string | null;
};

/** The chip on a Still open row: where the task came from and how long ago. */
export function stillOpenSource(
  task: Pick<Task, 'startDate' | 'noteId' | 'createdAt'>,
  day: string,
  note?: SourceNote,
): StillOpenSource {
  const noteId = task.noteId;
  if (task.startDate !== null) {
    return {
      label: `Scheduled ${formatTaskDay(task.startDate, false)}`,
      noteId,
    };
  }
  const created = localDayOf(task.createdAt);
  if (!noteId) {
    return {
      label: `Added ${relativeDayLabel(created, day, 'past')} · ${age(created, day)}`,
      noteId,
    };
  }
  const since = note?.type === 'daily' && note.date ? note.date : created;
  return {
    label: `${sourceNoteName(note, day)} · ${age(since, day)}`,
    noteId,
  };
}

/** How a Still open chip names the note a task came from: `Thu note`, or its title. */
export function sourceNoteName(note: SourceNote | undefined, day: string) {
  if (note?.type === 'daily' && note.date) {
    return `${relativeDayLabel(note.date, day, 'past')} note`;
  }
  return note ? note.title.trim() || 'Untitled note' : 'Note';
}

/** `Tomorrow · Sat, Oct 3`, else `Mon, Oct 5`. */
export function comingUpDayLabel(date: string, day: string): string {
  return date === addDays(day, 1)
    ? `Tomorrow · ${formatTaskDay(date)}`
    : formatTaskDay(date);
}

/** `Sat` within the coming week, else `Oct 12`. */
export function comingUpShortLabel(date: string, day: string): string {
  return relativeDayLabel(date, day, 'future');
}

/** Snooze counts from the later of the page's day and today. */
export function snoozeBaseDay(day: string, today: string): string {
  return day > today ? day : today;
}

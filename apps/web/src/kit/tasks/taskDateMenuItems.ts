import {
  activeTaskDateQuery,
  activeTaskDueQuery,
  matchesTaskDateQuery,
  resolveTaskDateToken,
  taskDateMenuOptions,
  type TaskSchedule,
} from '@gagnechris/shared';

export type TaskDateMenuItem = {
  id: string;
  label: string;
  detail: string;
  /** Null for Pick a date…, which asks for the day first. */
  token: string | null;
  /** What a date item sets; null for Pick a date… and Deadline…. */
  schedule: TaskSchedule | null;
};

/** `start` is the show-on date (`@…`); `due` the deadline (`due:…`). */
export type TaskDateKind = 'start' | 'due';

const PICK_KEYWORDS = ['pick a date', 'date'];
const DEADLINE_KEYWORDS = ['deadline', 'due'];

export type TaskDateQuery = {
  from: number;
  to: number;
  query: string;
  kind: TaskDateKind;
};

/**
 * The `@word` or `due:word` being typed at `caret` that still needs the
 * menu; a finished token (`@mon`) needs none, so Enter keeps its usual job.
 */
export function openTaskDateQuery(
  text: string,
  caret: number,
  today: string,
): TaskDateQuery | null {
  const due = activeTaskDueQuery(text, caret);
  const at = due ? null : activeTaskDateQuery(text, caret);
  const typed: TaskDateQuery | null = due
    ? { ...due, kind: 'due' }
    : at
      ? { ...at, kind: 'start' }
      : null;
  if (!typed || resolveTaskDateToken(typed.query, today)) return null;
  return taskDateMenuItems(today, typed.query, typed.kind).length > 0
    ? typed
    : null;
}

/** `deadline: false` drops Deadline…, for menus that only set the show-on day. */
export function taskDateMenuItems(
  today: string,
  query: string,
  kind: TaskDateKind = 'start',
  { deadline = kind === 'start' }: { deadline?: boolean } = {},
): TaskDateMenuItem[] {
  const dates: TaskDateMenuItem[] = taskDateMenuOptions(today)
    .filter(
      (o) =>
        (kind === 'start' || !o.someday) &&
        matchesTaskDateQuery(o.keywords, query),
    )
    .map((o) => ({
      id: o.id,
      label: o.label,
      detail: o.detail,
      token: kind === 'due' ? o.token.replace(/^@/, 'due:') : o.token,
      schedule: { startDate: o.startDate, someday: o.someday },
    }));
  return [
    ...dates,
    ...(matchesTaskDateQuery(PICK_KEYWORDS, query)
      ? [
          {
            id: 'pick',
            label: 'Pick a date…',
            detail: '',
            token: null,
            schedule: null,
          },
        ]
      : []),
    ...(deadline && matchesTaskDateQuery(DEADLINE_KEYWORDS, query)
      ? [
          {
            id: 'deadline',
            label: 'Deadline…',
            detail: 'due:',
            token: 'due:',
            schedule: null,
          },
        ]
      : []),
  ];
}

/** A token ending in `:` still needs its date, so it takes no space after. */
export const tokenNeedsDate = (token: string) => token.endsWith(':');

export const taskDateMenuIds = (baseId: string) => ({
  listbox: `${baseId}-listbox`,
  heading: `${baseId}-heading`,
  hint: `${baseId}-hint`,
  option: (id: string) => `${baseId}-option-${id}`,
});

export const tomorrowOf = (today: string) =>
  resolveTaskDateToken('tomorrow', today)?.startDate ?? today;

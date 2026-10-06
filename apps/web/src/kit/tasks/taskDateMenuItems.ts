import {
  activeTaskDateQuery,
  activeTaskDueQuery,
  matchesTaskDateQuery,
  resolveTaskDateToken,
  taskDateMenuOptions,
} from '@gagnechris/shared';

export type TaskDateMenuItem = {
  id: string;
  label: string;
  detail: string;
  /** Null for Pick a date…, which asks for the day first. */
  token: string | null;
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

export function taskDateMenuItems(
  today: string,
  query: string,
  kind: TaskDateKind = 'start',
): TaskDateMenuItem[] {
  const dates = taskDateMenuOptions(today).filter(
    (o) =>
      (kind === 'start' || !o.someday) &&
      matchesTaskDateQuery(o.keywords, query),
  );
  return [
    ...(kind === 'due'
      ? dates.map((o) => ({ ...o, token: o.token.replace(/^@/, 'due:') }))
      : dates),
    ...(matchesTaskDateQuery(PICK_KEYWORDS, query)
      ? [{ id: 'pick', label: 'Pick a date…', detail: '', token: null }]
      : []),
    ...(kind === 'start' && matchesTaskDateQuery(DEADLINE_KEYWORDS, query)
      ? [
          {
            id: 'deadline',
            label: 'Deadline…',
            detail: 'due:',
            token: 'due:',
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

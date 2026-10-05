import {
  activeTaskDateQuery,
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

const PICK_KEYWORDS = ['pick a date', 'date'];

export type TaskDateQuery = { from: number; to: number; query: string };

/**
 * The `@word` being typed at `caret` that still needs the menu; a finished
 * token (`@mon`) needs none, so Enter keeps its usual job.
 */
export function openTaskDateQuery(
  text: string,
  caret: number,
  today: string,
): TaskDateQuery | null {
  const typed = activeTaskDateQuery(text, caret);
  if (!typed || resolveTaskDateToken(typed.query, today)) return null;
  return taskDateMenuItems(today, typed.query).length > 0 ? typed : null;
}

export function taskDateMenuItems(
  today: string,
  query: string,
): TaskDateMenuItem[] {
  return [
    ...taskDateMenuOptions(today).filter((o) =>
      matchesTaskDateQuery(o.keywords, query),
    ),
    ...(matchesTaskDateQuery(PICK_KEYWORDS, query)
      ? [{ id: 'pick', label: 'Pick a date…', detail: '', token: null }]
      : []),
  ];
}

export const taskDateMenuIds = (baseId: string) => ({
  listbox: `${baseId}-listbox`,
  heading: `${baseId}-heading`,
  hint: `${baseId}-hint`,
  option: (id: string) => `${baseId}-option-${id}`,
});

export const tomorrowOf = (today: string) =>
  resolveTaskDateToken('tomorrow', today)?.startDate ?? today;

import {
  addDays,
  calendarDay,
  formatCalendarDay,
  isCalendarDay,
  localDateString,
  MONTH_LONG,
  WEEKDAY_LONG,
  weekdayOf,
} from './calendar.js';
import type { TaskPriority } from './schemas.js';

export type ParsedTaskSyntax = {
  title: string;
  startDate: string | null;
  someday: boolean;
  /** The deadline from `due:…`, independent of the show-on date. */
  dueDate: string | null;
  priority: TaskPriority;
};

export type TaskSchedule = { startDate: string | null; someday: boolean };

const nameIndex = (
  names: readonly string[],
  base: number,
  aliases: Record<string, number>,
): Record<string, number> => ({
  ...Object.fromEntries(
    names.flatMap((name, i) => [
      [name.toLowerCase(), i + base],
      [name.slice(0, 3).toLowerCase(), i + base],
    ]),
  ),
  ...aliases,
});

const WEEKDAYS = nameIndex(WEEKDAY_LONG, 0, { tues: 2, thur: 4, thurs: 4 });

const MONTHS = nameIndex(MONTH_LONG, 1, { sept: 9 });

/** Always 1–7 days ahead: `@mon` on a Monday is the next one, since today is `@today`. */
export function nextWeekday(today: string, weekday: number): string {
  const delta = (weekday - weekdayOf(today)! + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

/** The first `month day` on or after today; Feb 29 waits for a leap year. */
function nextMonthDay(
  today: string,
  month: number,
  day: number,
): string | null {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  let year = month < m || (month === m && day < d) ? y + 1 : y;
  for (let tries = 0; tries < 8; tries++, year++) {
    const candidate = calendarDay(year, month, day);
    if (isCalendarDay(candidate)) return candidate;
  }
  return null;
}

/** Resolves the text after `@`, or null when it is not a date token. */
export function resolveTaskDateToken(
  token: string,
  today: string,
): TaskSchedule | null {
  const t = token.trim().toLowerCase().replace(/\s+/g, ' ');
  const on = (startDate: string | null): TaskSchedule | null =>
    startDate ? { startDate, someday: false } : null;
  if (t === 'someday') return { startDate: null, someday: true };
  if (t === 'today') return on(today);
  if (t === 'tomorrow') return on(addDays(today, 1));
  if (t === 'next week') return on(nextWeekday(today, 1));
  const weekday = WEEKDAYS[t];
  if (weekday !== undefined) return on(nextWeekday(today, weekday));
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return on(isCalendarDay(t) ? t : null);
  const monthDay = /^([a-z]+) (\d{1,2})$/.exec(t);
  const month = monthDay ? MONTHS[monthDay[1]!] : undefined;
  if (monthDay && month !== undefined) {
    return on(nextMonthDay(today, month, Number(monthDay[2])));
  }
  return null;
}

// Longest first, so `@oct 12` wins over a lone `@oct` and `@next week` over `@next`.
const TOKEN_SHAPES = [
  /next\s+week/iy,
  /[a-z]+\s+\d{1,2}/iy,
  /\d{4}-\d{2}-\d{2}/y,
  /[a-z]+/iy,
];
const AT_WORD_START = /(^|\s)@/g;
const DUE_WORD_START = /(^|\s)due:/gi;
const ENDS_WORD = /\s|$/y;
const PRIORITY_TOKEN = /(?:^|\s)!(high|med|low)(?=\s|$)/i;

/** The date token starting at `from` (just past its `@` or `due:`). */
function readDateToken(
  input: string,
  from: number,
  today: string,
): { end: number; schedule: TaskSchedule } | null {
  for (const shape of TOKEN_SHAPES) {
    shape.lastIndex = from;
    const word = shape.exec(input);
    if (!word) continue;
    const end = from + word[0].length;
    ENDS_WORD.lastIndex = end;
    if (!ENDS_WORD.test(input)) continue;
    const schedule = resolveTaskDateToken(word[0], today);
    if (schedule) return { end, schedule };
  }
  return null;
}

/**
 * `@today`, `@tomorrow`, `@mon`…`@sun`, `@next week`, `@oct 12`,
 * `@yyyy-mm-dd`, `@someday`, the same dates after `due:` (not `someday`),
 * and `!high`/`!med`/`!low`, anywhere in the text; the last of each kind
 * wins and everything else is the title.
 */
export function parseTaskSyntax(
  input: string,
  today: string = localDateString(),
): ParsedTaskSyntax {
  const spans: [number, number][] = [];
  let schedule: TaskSchedule = { startDate: null, someday: false };
  let dueDate: string | null = null;

  for (const at of input.matchAll(AT_WORD_START)) {
    const start = at.index + at[1]!.length;
    const token = readDateToken(input, start + 1, today);
    if (!token) continue;
    schedule = token.schedule;
    spans.push([start, token.end]);
  }
  for (const due of input.matchAll(DUE_WORD_START)) {
    const start = due.index + due[1]!.length;
    const token = readDateToken(input, start + 'due:'.length, today);
    if (!token || token.schedule.someday) continue;
    dueDate = token.schedule.startDate;
    spans.push([start, token.end]);
  }

  let rest = input;
  for (const [start, end] of spans.sort(([a], [b]) => b - a)) {
    rest = `${rest.slice(0, start)} ${rest.slice(end)}`;
  }
  rest = collapse(rest);

  let priority: TaskPriority = 'med';
  for (;;) {
    const pri = PRIORITY_TOKEN.exec(rest);
    if (!pri) break;
    priority = pri[1]!.toLowerCase() as TaskPriority;
    rest = collapse(
      `${rest.slice(0, pri.index)} ${rest.slice(pri.index + pri[0].length)}`,
    );
  }

  return { title: rest, ...schedule, dueDate, priority };
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** `Sat, Oct 3`, or `Oct 3` without the weekday. */
export function formatTaskDay(day: string, withWeekday = true): string {
  return formatCalendarDay(day, withWeekday ? { weekday: 'short' } : {});
}

/** What a note is called in lists and search: a daily note by its day. */
export function noteDisplayTitle(note: {
  type: 'daily' | 'page';
  date: string | null;
  title: string;
}): string {
  const title = note.title.trim();
  if (note.type === 'daily' && note.date && isCalendarDay(note.date)) {
    return formatCalendarDay(note.date, { weekday: 'long' });
  }
  return title || 'Untitled';
}

/** The shortest token that resolves back to `day` from `today`. */
export function taskDateToken(
  day: string,
  today: string,
  prefix: '@' | 'due:' = '@',
): string {
  if (!isCalendarDay(day)) return `${prefix}${day}`;
  const short = formatCalendarDay(day).toLowerCase();
  return resolveTaskDateToken(short, today)?.startDate === day
    ? `${prefix}${short}`
    : `${prefix}${day}`;
}

export type TaskDateMenuOption = {
  id: 'tomorrow' | 'monday' | 'next-week' | 'someday';
  label: string;
  token: string;
  detail: string;
  /** Typed prefixes after `@` that keep this option in the menu. */
  keywords: string[];
} & TaskSchedule;

export function taskDateMenuOptions(today: string): TaskDateMenuOption[] {
  const tomorrow = addDays(today, 1);
  const monday = nextWeekday(today, 1);
  return [
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      token: '@tomorrow',
      detail: formatTaskDay(tomorrow),
      keywords: ['tomorrow'],
      startDate: tomorrow,
      someday: false,
    },
    {
      id: 'monday',
      label: 'Monday',
      token: '@mon',
      detail: formatTaskDay(monday, false),
      keywords: ['monday'],
      startDate: monday,
      someday: false,
    },
    {
      id: 'next-week',
      label: 'Next week',
      token: '@next week',
      detail: formatTaskDay(monday),
      keywords: ['next week', 'week'],
      startDate: monday,
      someday: false,
    },
    {
      id: 'someday',
      label: 'Someday',
      token: '@someday',
      detail: 'No date, parked',
      keywords: ['someday'],
      startDate: null,
      someday: true,
    },
  ];
}

export const matchesTaskDateQuery = (keywords: string[], query: string) => {
  const q = query.toLowerCase();
  return keywords.some((k) => k.startsWith(q));
};

/** The `due:word` being typed at `caret`, if any; `from` is the `d`. */
export function activeTaskDueQuery(
  text: string,
  caret: number,
): { from: number; to: number; query: string } | null {
  if (caret < text.length && !/\s/.test(text[caret]!)) return null;
  const before = text.slice(0, caret);
  const m = /(?:^|\s)due:(\S*)$/i.exec(before);
  if (!m) return null;
  return { from: caret - m[1]!.length - 4, to: caret, query: m[1]! };
}

/** The `@word` being typed at `caret`, if any; `from` is the `@`. */
export function activeTaskDateQuery(
  text: string,
  caret: number,
): { from: number; to: number; query: string } | null {
  if (caret < text.length && !/\s/.test(text[caret]!)) return null;
  const before = text.slice(0, caret);
  const m = /(?:^|\s)@(\S*)$/.exec(before);
  if (!m) return null;
  return { from: caret - m[1]!.length - 1, to: caret, query: m[1]! };
}

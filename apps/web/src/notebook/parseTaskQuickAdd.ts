import type { TaskPriority } from '@gagnechris/app-core';
import { addLocalDays, localToday } from './calendarDates';

export type ParsedTaskQuickAdd = {
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
};

const PRIORITY_TOKEN = /(?:^|\s)!(high|med|low)(?=\s|$)/i;
/** Due words count only at the end, so "Plan for Today show" keeps its title. */
const TRAILING_DUE_TOKEN = /(?:^|\s)(today|tomorrow)$/i;

/** Strips `!high|!med|!low` anywhere and a trailing `today|tomorrow`; the rest is the title. */
export function parseTaskQuickAdd(
  input: string,
  today = localToday(),
): ParsedTaskQuickAdd {
  let rest = input.trim();
  let priority: TaskPriority = 'med';
  let dueDate: string | null = null;

  for (;;) {
    const pri = PRIORITY_TOKEN.exec(rest);
    if (!pri) break;
    priority = pri[1]!.toLowerCase() as TaskPriority;
    rest = collapse(
      `${rest.slice(0, pri.index)} ${rest.slice(pri.index + pri[0].length)}`,
    );
  }

  const due = TRAILING_DUE_TOKEN.exec(rest);
  if (due) {
    dueDate =
      due[1]!.toLowerCase() === 'tomorrow' ? addLocalDays(today, 1) : today;
    rest = collapse(rest.slice(0, due.index));
  }

  return { title: rest, priority, dueDate };
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

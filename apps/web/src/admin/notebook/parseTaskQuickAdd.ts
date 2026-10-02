import type { TaskPriority } from '@gagnechris/app-core';
import { addLocalDays, localToday } from './calendarDates';

export type ParsedTaskQuickAdd = {
  title: string;
  priority: TaskPriority;
  dueDate: string | null;
};

const PRIORITY_TOKEN = /(?:^|\s)!(high|med|low)(?=\s|$)/i;
const DUE_TOKEN = /(?:^|\s)(today|tomorrow)(?=\s|$)/i;

/**
 * Parse quick-add text: strip `!high|!med|!low` and `today|tomorrow`,
 * remainder is the title.
 */
export function parseTaskQuickAdd(
  input: string,
  today = localToday(),
): ParsedTaskQuickAdd {
  let rest = input.trim();
  let priority: TaskPriority = 'med';
  let dueDate: string | null = null;

  for (;;) {
    const pri = PRIORITY_TOKEN.exec(rest);
    const due = DUE_TOKEN.exec(rest);
    if (!pri && !due) break;

    const takePri =
      pri && (!due || (pri.index ?? 0) <= (due.index ?? 0)) ? pri : null;
    const match = takePri ?? due!;
    if (takePri) {
      priority = takePri[1]!.toLowerCase() as TaskPriority;
    } else {
      const token = match[1]!.toLowerCase();
      dueDate = token === 'tomorrow' ? addLocalDays(today, 1) : today;
    }
    rest =
      `${rest.slice(0, match.index)}${rest.slice(match.index! + match[0].length)}`
        .replace(/\s+/g, ' ')
        .trim();
  }

  return { title: rest, priority, dueDate };
}

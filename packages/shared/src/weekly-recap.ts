import * as z from 'zod';
import { addDays, weekdayOf } from './calendar.js';
import {
  CalendarDateSchema,
  NotebookAreaSchema,
  UlidSchema,
} from './schemas.js';

/** The recap note's body until the recap is written into it. */
export const WEEKLY_RECAP_PENDING_MARKDOWN = '_Writing your weekly recap…_';
export const WEEKLY_RECAP_TAG = 'recap';

/** Monday of the week `day` falls in; weeks run Monday to Sunday. */
export function weekStartOf(day: string): string {
  const weekday = weekdayOf(day);
  if (weekday === null) return day;
  return addDays(day, -((weekday + 6) % 7));
}

export const isWeeklyRecapPending = (note: {
  bodyMarkdown: string;
  tags: readonly string[];
}): boolean =>
  note.tags.includes(WEEKLY_RECAP_TAG) &&
  note.bodyMarkdown.trim() === WEEKLY_RECAP_PENDING_MARKDOWN;

export const CreateWeeklyRecapRequestSchema = z.object({
  id: UlidSchema.describe('Client ULID for the recap note'),
  area: NotebookAreaSchema,
  weekStart: CalendarDateSchema.refine(
    (day) => weekdayOf(day) === 1,
    'Must be a Monday',
  ).describe('Monday of the week to recap'),
});

export type CreateWeeklyRecapRequest = z.infer<
  typeof CreateWeeklyRecapRequestSchema
>;

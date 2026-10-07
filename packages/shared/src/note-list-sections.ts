import { byNewest } from './by-newest.js';
import { addDays, localDayOf, relativeDayLabel } from './calendar.js';
import type { Note } from './schemas.js';
import { findTaskEmbeds, taskEmbedIds } from './task-embeds.js';
import { noteDisplayTitle } from './task-syntax.js';

export type ListNote = Pick<
  Note,
  | 'id'
  | 'type'
  | 'date'
  | 'title'
  | 'bodyMarkdown'
  | 'pinned'
  | 'updatedAt'
  | 'area'
>;

export type NoteSection<T> = {
  key: 'pinned' | 'week' | 'earlier';
  label: string;
  notes: T[];
};

/** The day a note is listed under: a daily note's own date, else its last edit. */
export function noteDay(note: ListNote): string {
  if (note.type === 'daily' && note.date) return note.date;
  return note.updatedAt ? localDayOf(note.updatedAt) : '';
}

export const noteTitle = noteDisplayTitle;

/** `Today`, a weekday within the last week, else `Sep 22` (with the year if not this one). */
export function noteDayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  return relativeDayLabel(day, today, 'past', { otherYear: true });
}

/** The first line of prose: no task embeds, no markdown markers. */
export function noteFirstLine(markdown: string): string {
  const embedLines = new Set(findTaskEmbeds(markdown).map((e) => e.line));
  const lines = markdown.split('\n');
  for (const [i, raw] of lines.entries()) {
    if (embedLines.has(i)) continue;
    const text = raw
      .replace(
        /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|\[ \]\s+)/,
        '',
      )
      .replace(/[*_`~]/g, '')
      .trim();
    if (text) return text;
  }
  return '';
}

/**
 * Pinned first, then notes from the last seven days, then the rest; newest
 * first in each. Empty sections are dropped.
 */
export function noteSections<T extends ListNote>(
  notes: readonly T[],
  today: string,
): NoteSection<T>[] {
  const weekStart = addDays(today, -6);
  const sorted = [...notes].sort(
    (a, b) =>
      byNewest(noteDay(a), noteDay(b)) || byNewest(a.updatedAt, b.updatedAt),
  );
  const sections: NoteSection<T>[] = [
    { key: 'pinned', label: 'Pinned', notes: [] },
    { key: 'week', label: 'This week', notes: [] },
    { key: 'earlier', label: 'Earlier', notes: [] },
  ];
  for (const note of sorted) {
    const section = note.pinned
      ? sections[0]!
      : noteDay(note) >= weekStart
        ? sections[1]!
        : sections[2]!;
    section.notes.push(note);
  }
  return sections.filter((s) => s.notes.length > 0);
}

/** Tasks the note embeds that are still open; 0 while the open list is partial. */
export function noteOpenTaskCount(
  markdown: string,
  openIds: ReadonlySet<string> | null,
): number {
  return openIds
    ? taskEmbedIds(markdown).filter((id) => openIds.has(id)).length
    : 0;
}

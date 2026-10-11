import type { Note } from '@gagnechris/app-core';

/** A daily note is written on Today, which keeps its date and area. */
export const noteHref = (
  note: Pick<Note, 'id' | 'type' | 'date' | 'area'>,
): string =>
  note.type === 'daily' && note.date
    ? `/today?date=${note.date}&area=${note.area}`
    : `/notes/${note.id}`;

import {
  byNewest,
  findTaskEmbeds,
  type ListNote,
  noteDay,
} from '@gagnechris/shared';

export type TaskMention<T extends ListNote> = {
  note: T;
  /** The prose written under the embed, markers stripped. */
  context: string;
  home: boolean;
};

const EXCERPT_CHARS = 280;

const MARKERS =
  /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|\[ \]\s+)/;

/** Prose between the task's embed and whatever embed comes next. */
export function embedContext(markdown: string, taskId: string): string {
  const embeds = findTaskEmbeds(markdown);
  const at = embeds.findIndex((e) => e.id === taskId.toUpperCase());
  if (at === -1) return '';
  const lines = markdown.split('\n');
  const end = embeds[at + 1]?.line ?? lines.length;
  const text = lines
    .slice(embeds[at]!.line + 1, end)
    .map((line) =>
      line
        .replace(MARKERS, '')
        .replace(/[*_`~]/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
  return text.length > EXCERPT_CHARS
    ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…`
    : text;
}

/**
 * The notes embedding `taskId`: the task's home note first, then oldest to
 * newest, so a task that ran over several days reads as its own history.
 */
export function taskMentions<T extends ListNote>(
  notes: readonly T[],
  taskId: string,
  homeNoteId: string | null,
): TaskMention<T>[] {
  const id = taskId.toUpperCase();
  return notes
    .filter((note) =>
      findTaskEmbeds(note.bodyMarkdown).some((e) => e.id === id),
    )
    .map((note) => ({
      note,
      context: embedContext(note.bodyMarkdown, id),
      home: note.id === homeNoteId,
    }))
    .sort(
      (a, b) =>
        Number(b.home) - Number(a.home) ||
        byNewest(noteDay(b.note), noteDay(a.note)) ||
        byNewest(b.note.updatedAt, a.note.updatedAt),
    );
}

import type { TaskEmbedCreate } from '@gagnechris/app-core';
import {
  fenceLineKind,
  findTaskEmbeds,
  parseTaskLine,
  scanFences,
  taskEmbedToken,
} from '@gagnechris/shared';

/**
 * A note body as the editor shows it: runs of text lines, each edited in its
 * own text view, between `{{task:…}}` lines, which render as task rows.
 * A text run sits before, between and after every embed, so there is always
 * somewhere to type; an empty run holds no lines.
 *
 * A text run is keyed by the embed after it, so converting a line keeps the
 * focused view (now the text after the new task) mounted with its keyboard.
 */
export type NoteSegment =
  | { kind: 'text'; key: string; start: number; lines: string[] }
  | { kind: 'embed'; key: string; start: number; id: string; line: string };

export const noteSegments = (markdown: string): NoteSegment[] => {
  const lines = markdown.split('\n');
  const embeds = new Map(findTaskEmbeds(markdown).map((e) => [e.line, e.id]));
  const segments: NoteSegment[] = [];
  const seen = new Map<string, number>();
  let text: string[] = [];
  let start = 0;
  lines.forEach((line, i) => {
    const id = embeds.get(i);
    if (id === undefined) {
      text.push(line);
      return;
    }
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    const key = n === 1 ? id : `${id}#${n}`;
    segments.push({ kind: 'text', key: `before:${key}`, start, lines: text });
    segments.push({ kind: 'embed', key, start: i, id, line });
    text = [];
    start = i + 1;
  });
  segments.push({ kind: 'text', key: 'end', start, lines: text });
  return segments;
};

export const segmentText = (segment: { lines: string[] }) =>
  segment.lines.join('\n');

/** An emptied text view leaves no blank line behind. */
const linesOf = (text: string) => (text === '' ? [] : text.split('\n'));

export const joinSegments = (segments: readonly NoteSegment[]) =>
  segments.flatMap((s) => (s.kind === 'text' ? s.lines : [s.line])).join('\n');

export const replaceSegmentText = (
  segments: readonly NoteSegment[],
  key: string,
  text: string,
) =>
  joinSegments(
    segments.map((s) =>
      s.key === key && s.kind === 'text' ? { ...s, lines: linesOf(text) } : s,
    ),
  );

export const removeSegment = (segments: readonly NoteSegment[], key: string) =>
  joinSegments(segments.filter((s) => s.key !== key));

/** The line and column of `offset` within `text`. */
export const lineAt = (text: string, offset: number) => {
  const before = text.slice(0, Math.min(offset, text.length));
  const line = before.split('\n').length - 1;
  return { line, column: before.length - before.lastIndexOf('\n') - 1 };
};

/** The offset of `line`/`column` within `lines`, clamped to the text. */
export const offsetOf = (
  lines: readonly string[],
  line: number,
  column: number,
) => {
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i += 1) {
    offset += lines[i]!.length + 1;
  }
  return offset + Math.min(column, lines[line]?.length ?? 0);
};

/**
 * Turns a `[ ] …` line into `{{task:id}}` with the same rules as web: task
 * syntax sets the schedule and priority; lines in a code fence stay text.
 */
export const convertTaskLine = (
  markdown: string,
  line: number,
  today: string,
  newId: () => string,
): { markdown: string; create: TaskEmbedCreate } | null => {
  const lines = markdown.split('\n');
  const text = lines[line];
  if (text === undefined || fenceLineKind(scanFences(lines), line)) return null;
  const parsed = parseTaskLine(text, today);
  if (!parsed) return null;
  const id = newId();
  lines[line] = parsed.indent + taskEmbedToken(id);
  return { markdown: lines.join('\n'), create: { id, draft: parsed.draft } };
};

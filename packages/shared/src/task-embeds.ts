import type { TaskStatus } from './schemas.js';

/**
 * A note embeds a task as a line holding only `{{task:<ULID>}}` (optionally
 * indented). The note never stores the task's title or checked state; every
 * client renders the line from the task record. Platform-neutral so the API,
 * web and native app share one parser.
 */

const EMBED_LINE =
  /^([ \t]*)\{\{task:([0-7][0-9A-HJKMNP-TV-Z]{25})\}\}[ \t]*$/i;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

export type TaskEmbed = {
  id: string;
  /** Zero-based line index. */
  line: number;
  indent: string;
};

export function taskEmbedToken(id: string): string {
  return `{{task:${id.toUpperCase()}}}`;
}

export function parseTaskEmbedLine(
  line: string,
): { id: string; indent: string } | null {
  const match = EMBED_LINE.exec(line);
  if (!match) return null;
  return { id: match[2]!.toUpperCase(), indent: match[1]! };
}

/** Lines inside fenced code blocks are text, not embeds. */
export function findTaskEmbeds(markdown: string): TaskEmbed[] {
  const embeds: TaskEmbed[] = [];
  let fence: string | null = null;
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i]!.replace(/\r$/, '');
    const opener = FENCE.exec(text);
    if (fence) {
      if (
        opener &&
        opener[1]![0] === fence[0] &&
        opener[1]!.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (opener) {
      fence = opener[1]!;
      continue;
    }
    const embed = parseTaskEmbedLine(text);
    if (embed) embeds.push({ ...embed, line: i });
  }
  return embeds;
}

/** Unique, in first-seen order. */
export function taskEmbedIds(markdown: string): string[] {
  return [...new Set(findTaskEmbeds(markdown).map((e) => e.id))];
}

export function replaceTaskEmbeds(
  markdown: string,
  render: (embed: TaskEmbed) => string,
): string {
  const embeds = findTaskEmbeds(markdown);
  if (embeds.length === 0) return markdown;
  const lines = markdown.split('\n');
  for (const embed of embeds) {
    const cr = lines[embed.line]!.endsWith('\r') ? '\r' : '';
    lines[embed.line] = `${render(embed)}${cr}`;
  }
  return lines.join('\n');
}

export type TaskEmbedMarkdownTask = {
  title: string;
  status: TaskStatus;
};

/** Plain GFM checklist line for exports and renderers without live tasks. */
export function taskEmbedFallbackLine(
  embed: Pick<TaskEmbed, 'indent'>,
  task: TaskEmbedMarkdownTask | undefined,
): string {
  if (!task) return `${embed.indent}- [ ] (deleted task)`;
  const box = task.status === 'done' ? 'x' : ' ';
  return `${embed.indent}- [${box}] ${task.title}`;
}

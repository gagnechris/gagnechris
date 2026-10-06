import { fenceLineKind, scanFences } from './markdown-fences.js';
import { ULID_PATTERN, type TaskStatus } from './schemas.js';

/**
 * A note embeds a task as a line holding only `{{task:<ULID>}}` (optionally
 * indented). The note never stores the task's title or checked state; every
 * client renders the line from the task record. Platform-neutral so the API,
 * web and native app share one parser.
 */

const EMBED_LINE = new RegExp(
  String.raw`^([ \t]*)\{\{task:(${ULID_PATTERN.slice(1, -1)})\}\}[ \t]*$`,
  'i',
);

export type TaskEmbed = {
  id: string;
  /** Zero-based line index. */
  line: number;
  indent: string;
};

export function taskEmbedToken(id: string): string {
  return `{{task:${id.toUpperCase()}}}`;
}

export const CARRIED_IN_HEADING = '## Carried in';

/** The block a new daily note opens with: open tasks from earlier days. */
export function carriedInMarkdown(taskIds: readonly string[]): string {
  return `${CARRIED_IN_HEADING}\n\n${taskIds.map(taskEmbedToken).join('\n')}\n\n`;
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
  const lines = markdown.split('\n').map((line) => line.replace(/\r$/, ''));
  const fences = scanFences(lines);
  const embeds: TaskEmbed[] = [];
  lines.forEach((text, i) => {
    if (fenceLineKind(fences, i)) return;
    const embed = parseTaskEmbedLine(text);
    if (embed) embeds.push({ ...embed, line: i });
  });
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
  if (task.status === 'dropped') {
    return `${embed.indent}- [ ] ~~${task.title}~~ (dropped)`;
  }
  const box = task.status === 'done' ? 'x' : ' ';
  return `${embed.indent}- [${box}] ${task.title}`;
}

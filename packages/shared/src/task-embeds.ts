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

export type CarriedInTask = { id: string; parentId?: string | null };

/**
 * The block a new daily note opens with: open tasks from earlier days. A
 * subtask whose parent carries in too sits indented under it.
 */
export function carriedInMarkdown(tasks: readonly CarriedInTask[]): string {
  const ids = new Set(tasks.map((t) => t.id.toUpperCase()));
  const parentOf = (t: CarriedInTask) => t.parentId?.toUpperCase() ?? null;
  const byId = new Map(tasks.map((t) => [t.id.toUpperCase(), t]));
  const nestedUnder = (t: CarriedInTask): string | null => {
    const parent = parentOf(t);
    if (!parent || parent === t.id.toUpperCase() || !ids.has(parent)) {
      return null;
    }
    const grand = parentOf(byId.get(parent)!);
    return grand && grand !== parent && ids.has(grand) ? null : parent;
  };
  const children = new Map<string, CarriedInTask[]>();
  for (const t of tasks) {
    const parent = nestedUnder(t);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), t]);
  }
  const lines: string[] = [];
  for (const t of tasks) {
    if (nestedUnder(t)) continue;
    lines.push(taskEmbedToken(t.id));
    for (const child of children.get(t.id.toUpperCase()) ?? []) {
      lines.push(`  ${taskEmbedToken(child.id)}`);
    }
  }
  return `${CARRIED_IN_HEADING}\n\n${lines.join('\n')}\n\n`;
}

/** Leading spaces and tabs, each counted as one column. */
export const indentWidth = (text: string) => /^[ \t]*/.exec(text)![0].length;

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

/** Drops each line that embeds one of `ids`. */
export function removeTaskEmbedLines(
  markdown: string,
  ids: ReadonlySet<string>,
): string {
  const drop = new Set(
    findTaskEmbeds(markdown)
      .filter((e) => ids.has(e.id))
      .map((e) => e.line),
  );
  if (drop.size === 0) return markdown;
  return markdown
    .split('\n')
    .filter((_, i) => !drop.has(i))
    .join('\n');
}

export type TaskEmbedNesting = TaskEmbed & {
  /** The top-level task line this one sits directly under, if any. */
  parentId: string | null;
  /** Under another task line, so never a parent itself. */
  nested: boolean;
  /** How many task lines it sits under. */
  depth: number;
};

/**
 * Each embed with the task it is a subtask of. A line is under the nearest
 * line above it with less indent, with no blank line between them (the block
 * a line move carries). Subtasks are one level deep: a task line under a
 * subtask is nested but has no parent.
 */
export function taskEmbedNesting(markdown: string): TaskEmbedNesting[] {
  const lines = markdown.split('\n').map((line) => line.replace(/\r$/, ''));
  const embedAt = new Map(findTaskEmbeds(markdown).map((e) => [e.line, e]));
  const owner: (number | null)[] = [];
  const underTask: boolean[] = [];
  const depth: number[] = [];
  let stack: number[] = [];
  lines.forEach((text, i) => {
    owner.push(null);
    underTask.push(false);
    depth.push(0);
    if (text.trim() === '') {
      stack = [];
      return;
    }
    const width = indentWidth(text);
    while (
      stack.length > 0 &&
      indentWidth(lines[stack[stack.length - 1]!]!) >= width
    ) {
      stack.pop();
    }
    const above = stack[stack.length - 1] ?? null;
    owner[i] = above;
    underTask[i] = above !== null && (embedAt.has(above) || underTask[above]!);
    depth[i] =
      above === null ? 0 : depth[above]! + (embedAt.has(above) ? 1 : 0);
    stack.push(i);
  });
  return [...embedAt.values()].map((embed) => {
    const above = owner[embed.line]!;
    const parent = above === null ? undefined : embedAt.get(above);
    return {
      ...embed,
      parentId:
        parent && !underTask[above!] && parent.id !== embed.id
          ? parent.id
          : null,
      nested: underTask[embed.line]!,
      depth: depth[embed.line]!,
    };
  });
}

/** Each subtask in the note, first line per task, with its parent. */
export function taskEmbedParents(
  markdown: string,
): { id: string; parentId: string }[] {
  const seen = new Set<string>();
  const out: { id: string; parentId: string }[] = [];
  for (const e of taskEmbedNesting(markdown)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.parentId) out.push({ id: e.id, parentId: e.parentId });
  }
  return out;
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

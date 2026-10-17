import { NOTEBOOK_TITLE_MAX_LENGTH, type TaskPriority } from './schemas.js';
import { parseTaskSyntax } from './task-syntax.js';

/** Fields a typed `[ ] …` line contributes to the task it creates. */
export type TaskLineDraft = {
  title: string;
  startDate: string | null;
  someday: boolean;
  dueDate: string | null;
  priority: TaskPriority;
};

/** A task title is one line: pasted line breaks become spaces. */
export const oneLineTaskTitle = (text: string) =>
  text.replace(/\s*\n\s*/g, ' ');

/** `[ ] ` at the start of a line, after any indent. */
export const TASK_LINE_PREFIX = /^[ \t]*\[ \][ \t]+/;

const TASK_LINE = /^([ \t]*)\[ \][ \t]+(\S.*?)[ \t]*$/;

const BULLET_CHECKBOX = /^([ \t]*)[-*+][ \t]+\[ \]$/;

/**
 * A line's text up to the caret, just after typing the `]` of `- [ ]`: the
 * same line as a task line (`[ ]` after the indent), or null.
 */
export function bulletCheckboxAsTask(beforeCaret: string): string | null {
  const match = BULLET_CHECKBOX.exec(beforeCaret);
  return match ? `${match[1]}[ ]` : null;
}

/**
 * `after` is `before` with one `]` typed before `caret`; when that `]`
 * completes `- [ ]` at a bullet's start, the text with that bullet as a task
 * line and the caret after its `[ ]`. A `- [ ](url)` link is left alone.
 */
export function typedBulletCheckboxAsTask(
  before: string,
  after: string,
  caret: number,
): { text: string; caret: number } | null {
  if (
    caret < 1 ||
    after.length !== before.length + 1 ||
    after[caret - 1] !== ']' ||
    after[caret] === '(' ||
    after.slice(0, caret - 1) + after.slice(caret) !== before
  ) {
    return null;
  }
  const from = after.lastIndexOf('\n', caret - 1) + 1;
  const task = bulletCheckboxAsTask(after.slice(from, caret));
  if (task === null) return null;
  return {
    text: after.slice(0, from) + task + after.slice(caret),
    caret: from + task.length,
  };
}

/** The one place a typed line becomes task fields, task syntax included. */
export function taskLineDraft(
  text: string,
  today?: string,
): TaskLineDraft | null {
  const parsed = parseTaskSyntax(text, today);
  const title = parsed.title.slice(0, NOTEBOOK_TITLE_MAX_LENGTH).trimEnd();
  return title ? { ...parsed, title } : null;
}

export function parseTaskLine(
  line: string,
  today?: string,
): { indent: string; draft: TaskLineDraft } | null {
  const match = TASK_LINE.exec(line);
  if (!match) return null;
  const draft = taskLineDraft(match[2]!, today);
  return draft ? { indent: match[1]!, draft } : null;
}

/** Same line, same task: undoing a conversion and leaving again reuses the id. */
export const taskLineDraftKey = (draft: TaskLineDraft) =>
  [
    draft.title,
    draft.startDate,
    draft.someday,
    draft.dueDate,
    draft.priority,
  ].join('\u0000');

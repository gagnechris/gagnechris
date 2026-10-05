import {
  NOTEBOOK_TITLE_MAX_LENGTH,
  parseTaskSyntax,
  type TaskPriority,
} from '@gagnechris/shared';

/** Fields a typed `[ ] …` line contributes to the task it creates. */
export type TaskLineDraft = {
  title: string;
  startDate: string | null;
  someday: boolean;
  priority: TaskPriority;
};

const TASK_LINE = /^([ \t]*)\[ \][ \t]+(\S.*?)[ \t]*$/;

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
  [draft.title, draft.startDate, draft.someday, draft.priority].join('\u0000');

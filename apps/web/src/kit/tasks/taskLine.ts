import { NOTEBOOK_TITLE_MAX_LENGTH } from '@gagnechris/shared';

/** Fields a typed `[ ] …` line contributes to the task it creates. */
export type TaskLineDraft = {
  title: string;
};

const TASK_LINE = /^([ \t]*)\[ \][ \t]+(\S.*?)[ \t]*$/;

/**
 * The one place a typed line becomes task fields; inline syntax such as
 * dates and priority parses here.
 */
export function taskLineDraft(text: string): TaskLineDraft | null {
  const title = text.trim().slice(0, NOTEBOOK_TITLE_MAX_LENGTH).trimEnd();
  return title ? { title } : null;
}

export function parseTaskLine(
  line: string,
): { indent: string; draft: TaskLineDraft } | null {
  const match = TASK_LINE.exec(line);
  if (!match) return null;
  const draft = taskLineDraft(match[2]!);
  return draft ? { indent: match[1]!, draft } : null;
}

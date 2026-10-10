import * as z from 'zod';
import { formatCalendarDay, weekdayName } from './calendar.js';
import { fenceLineKind, scanFences } from './markdown-fences.js';
import { NOTEBOOK_AREA_LABELS } from './notebook-area.js';
import {
  NotebookAreaSchema,
  VersionSchema,
  utf8ByteLength,
  type NotebookArea,
} from './schemas.js';
import { findTaskEmbeds } from './task-embeds.js';

export const DAILY_TEMPLATE_MAX_BYTES = 10_000;

export const DEFAULT_DAILY_TEMPLATES: Record<NotebookArea, string> = {
  work: '## Focus for {{weekday}}\n- \n\n## Standup\n\n## Meetings\n\n## Notes\n\n## Tomorrow\n- \n',
  personal: '## Plans\n- \n\n## Errands\n- [ ] \n\n## Notes\n',
};

export const DAILY_TEMPLATE_DATE_TOKEN = '{{date}}';

/** `{{weekday}}`, `{{date}}` and `{{area}}` for the note's own day; other `{{…}}` stay. */
export function fillDailyTemplate(
  markdown: string,
  { area, date }: { area: NotebookArea; date: string },
): string {
  const values: Record<string, string> = {
    weekday: weekdayName(date, 'long'),
    date: formatCalendarDay(date, { weekday: 'long', month: 'long' }),
    area: NOTEBOOK_AREA_LABELS[area],
  };
  return markdown.replace(
    /\{\{(weekday|date|area)\}\}/g,
    (_, token: string) => values[token]!,
  );
}

const TASK_LINE = /^[ \t]*\[ \][ \t]+\S/;

export const DAILY_TEMPLATE_TASK_MESSAGE =
  'Templates can’t hold tasks, or a new one would be added every day. Use - [ ] for a checklist.';

/** Task lines and embeds would create or repeat a task in every new note. */
export function dailyTemplateHasTasks(markdown: string): boolean {
  if (findTaskEmbeds(markdown).length > 0) return true;
  const lines = markdown.split('\n');
  const fences = scanFences(lines);
  return lines.some(
    (line, i) => !fenceLineKind(fences, i) && TASK_LINE.test(line),
  );
}

const DailyTemplateTextSchema = z.string().superRefine((value, ctx) => {
  if (utf8ByteLength(value) > DAILY_TEMPLATE_MAX_BYTES) {
    ctx.addIssue({
      code: 'too_big',
      origin: 'string',
      maximum: DAILY_TEMPLATE_MAX_BYTES,
      inclusive: true,
      input: value,
      message: `Template is over the ${DAILY_TEMPLATE_MAX_BYTES / 1000} KB limit`,
    });
  } else if (dailyTemplateHasTasks(value)) {
    ctx.addIssue({ code: 'custom', message: DAILY_TEMPLATE_TASK_MESSAGE });
  }
});

export const DailyTemplateSchema = z.object({
  area: NotebookAreaSchema,
  bodyMarkdown: z.string(),
  isDefault: z
    .boolean()
    .describe(
      'True when the built-in template applies (never saved, or reset)',
    ),
  version: VersionSchema.describe(
    '0 until the template is first saved or reset',
  ),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
});

export type DailyTemplate = z.infer<typeof DailyTemplateSchema>;

export const UpdateDailyTemplateRequestSchema = z.object({
  version: VersionSchema.optional(),
  bodyMarkdown: DailyTemplateTextSchema.describe(
    `Up to ${DAILY_TEMPLATE_MAX_BYTES / 1000} KB (UTF-8; larger → 413); no task lines or embeds`,
  ),
});

export type UpdateDailyTemplateRequest = z.infer<
  typeof UpdateDailyTemplateRequestSchema
>;

export function defaultDailyTemplate(area: NotebookArea): DailyTemplate {
  return {
    area,
    bodyMarkdown: DEFAULT_DAILY_TEMPLATES[area],
    isDefault: true,
    version: 0,
    updatedAt: null,
  };
}

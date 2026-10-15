import * as z from 'zod';
import { formatCalendarDay, weekdayName } from './calendar.js';
import { fenceLineKind, scanFences } from './markdown-fences.js';
import {
  NotebookAreaSchema,
  VersionSchema,
  utf8ByteLength,
  type NotebookArea,
} from './schemas.js';
import {
  carriedInLines,
  carriedInMarkdown,
  findTaskEmbeds,
  type CarriedInTask,
} from './task-embeds.js';

export const DAILY_TEMPLATE_MAX_BYTES = 10_000;

/** The built-in templates of the default areas; any other area's is blank. */
export const DEFAULT_DAILY_TEMPLATES: Readonly<Record<string, string>> = {
  work: '## Focus for {{weekday}}\n- \n\n## Standup\n\n## Meetings\n\n## Notes\n\n## Tomorrow\n- \n',
  personal: '## Plans\n- \n\n## Errands\n- [ ] \n\n## Notes\n',
};

export const DAILY_TEMPLATE_DATE_TOKEN = '{{date}}';

export function defaultDailyTemplateMarkdown(area: NotebookArea): string {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DAILY_TEMPLATES, area)
    ? DEFAULT_DAILY_TEMPLATES[area]!
    : '';
}

/** `{{weekday}}`, `{{date}}` and `{{area}}` (the area's name) for the note's own day; other `{{…}}` stay. */
export function fillDailyTemplate(
  markdown: string,
  { areaName, date }: { areaName: string; date: string },
): string {
  const values: Record<string, string> = {
    weekday: weekdayName(date, 'long'),
    date: formatCalendarDay(date, { weekday: 'long', month: 'long' }),
    area: areaName,
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

const HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const CLOSING_HASHES = /(?:^|[ \t]+)#+$/;

function templateHeadings(lines: readonly string[]) {
  const fences = scanFences(lines);
  const headings: { line: number; text: string }[] = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const marker = HEADING.exec(line);
    if (marker && !fenceLineKind(fences, i)) {
      const text = line.slice(marker[0].length).trim();
      headings.push({ line: i, text: text.replace(CLOSING_HASHES, '') });
    }
  });
  return headings;
}

/** The template's heading texts, unfilled, in order and without repeats: the sections carried-in tasks can go under. */
export function dailyTemplateHeadings(markdown: string): string[] {
  const texts = templateHeadings(markdown.split('\n')).map((h) => h.text);
  return [...new Set(texts.filter(Boolean))];
}

/**
 * Carried-in task embeds at the end of the template's `section` (the first
 * heading when that one is unset or gone). A template with no heading gets
 * a Carried in section on top instead.
 */
export function carryIntoDailyTemplate(
  markdown: string,
  tasks: readonly CarriedInTask[],
  section: string | null,
): string {
  if (tasks.length === 0) return markdown;
  const lines = markdown.split('\n');
  const headings = templateHeadings(lines);
  const target =
    headings.find((h) => section !== null && h.text === section) ?? headings[0];
  if (!target) return carriedInMarkdown(tasks) + markdown;
  const next = headings.find((h) => h.line > target.line);
  let last = (next?.line ?? lines.length) - 1;
  while (last > target.line && lines[last]!.trim() === '') last -= 1;
  return [
    ...lines.slice(0, last + 1),
    '',
    ...carriedInLines(tasks),
    ...(next ? ['', ...lines.slice(next.line)] : ['']),
  ].join('\n');
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
  carryOverSection: z
    .string()
    .nullable()
    .describe(
      'Heading text, unfilled, whose section new days carry open tasks into; null means the first heading',
    ),
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

export const DAILY_TEMPLATE_SECTION_MESSAGE =
  'Carried-in tasks must go under a heading in this template.';

export const UpdateDailyTemplateRequestSchema = z
  .object({
    version: VersionSchema.optional(),
    bodyMarkdown: DailyTemplateTextSchema.describe(
      `Up to ${DAILY_TEMPLATE_MAX_BYTES / 1000} KB (UTF-8; larger → 413); no task lines or embeds`,
    ),
    carryOverSection: z
      .string()
      .nullable()
      .optional()
      .describe(
        'A heading of bodyMarkdown, or null for the first heading; omitted keeps the saved one',
      ),
  })
  .superRefine((value, ctx) => {
    const section = value.carryOverSection;
    if (
      typeof section === 'string' &&
      !dailyTemplateHeadings(value.bodyMarkdown).includes(section)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['carryOverSection'],
        message: DAILY_TEMPLATE_SECTION_MESSAGE,
      });
    }
  });

export type UpdateDailyTemplateRequest = z.infer<
  typeof UpdateDailyTemplateRequestSchema
>;

export function defaultDailyTemplate(area: NotebookArea): DailyTemplate {
  return {
    area,
    bodyMarkdown: defaultDailyTemplateMarkdown(area),
    carryOverSection: null,
    isDefault: true,
    version: 0,
    updatedAt: null,
  };
}

import * as z from 'zod';
import { formatCalendarDay, weekdayName } from './calendar.js';
import { UlidSchema, VersionSchema, utf8ByteLength } from './schemas.js';

export const NOTE_TEMPLATE_MAX_BYTES = 10_000;
export const NOTE_TEMPLATE_NAME_MAX_LENGTH = 100;
/** The list is one response with no paging, so the count is capped. */
export const NOTE_TEMPLATE_MAX_COUNT = 100;
export const NOTE_TEMPLATE_LIMIT_MESSAGE = `You can keep up to ${NOTE_TEMPLATE_MAX_COUNT} templates. Delete one to add another.`;

const NoteTemplateNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NOTE_TEMPLATE_NAME_MAX_LENGTH);

const NoteTemplateBodySchema = z
  .string()
  .superRefine((value, ctx) => {
    if (utf8ByteLength(value) > NOTE_TEMPLATE_MAX_BYTES) {
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: NOTE_TEMPLATE_MAX_BYTES,
        inclusive: true,
        input: value,
        message: `Template is over the ${NOTE_TEMPLATE_MAX_BYTES / 1000} KB limit`,
      });
    }
  })
  .describe(
    `Up to ${NOTE_TEMPLATE_MAX_BYTES / 1000} KB (UTF-8; larger → 413); task lines allowed`,
  );

export const NoteTemplateSchema = z.object({
  id: UlidSchema,
  name: z.string().min(1),
  bodyMarkdown: z.string(),
  version: VersionSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type NoteTemplate = z.infer<typeof NoteTemplateSchema>;

export const NoteTemplateListResponseSchema = z.object({
  items: z.array(NoteTemplateSchema).describe('Every template, oldest first'),
});

export const CreateNoteTemplateRequestSchema = z.object({
  id: UlidSchema,
  name: NoteTemplateNameSchema,
  bodyMarkdown: NoteTemplateBodySchema.default(''),
});

export type CreateNoteTemplateRequest = z.input<
  typeof CreateNoteTemplateRequestSchema
>;

export const UpdateNoteTemplateRequestSchema = z.object({
  version: VersionSchema.optional(),
  name: NoteTemplateNameSchema.optional(),
  bodyMarkdown: NoteTemplateBodySchema.optional(),
});

export type UpdateNoteTemplateRequest = z.infer<
  typeof UpdateNoteTemplateRequestSchema
>;

/** By name, ignoring case. */
export function compareNoteTemplates(
  a: Pick<NoteTemplate, 'name' | 'id'>,
  b: Pick<NoteTemplate, 'name' | 'id'>,
): number {
  const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  return byName !== 0 ? byName : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * `{{weekday}}` and `{{date}}` for `date`, and `{{area}}` (the area's name)
 * when the note has one; other `{{…}}` stay.
 */
export function fillNoteTemplate(
  markdown: string,
  { date, areaName }: { date: string; areaName?: string },
): string {
  const values: Record<string, string> = {
    weekday: weekdayName(date, 'long'),
    date: formatCalendarDay(date, { weekday: 'long', month: 'long' }),
    ...(areaName ? { area: areaName } : {}),
  };
  return markdown.replace(
    /\{\{(weekday|date|area)\}\}/g,
    (token: string, name: string) => values[name] ?? token,
  );
}

/** Templates whose name contains every word of `query`, in name order. */
export function filterNoteTemplates<
  T extends Pick<NoteTemplate, 'name' | 'id'>,
>(templates: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return templates
    .filter((t) => {
      const name = t.name.toLowerCase();
      return words.every((w) => name.includes(w));
    })
    .sort(compareNoteTemplates);
}

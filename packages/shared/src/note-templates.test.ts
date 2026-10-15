import { describe, expect, test } from 'vitest';
import {
  CreateNoteTemplateRequestSchema,
  NOTE_TEMPLATE_MAX_BYTES,
  fillNoteTemplate,
  filterNoteTemplates,
} from './note-templates.js';

const t = (id: string, name: string) => ({ id, name });

describe('fillNoteTemplate', () => {
  test('fills the day, and the area when the note has one', () => {
    const markdown = '{{weekday}} · {{date}} · {{area}} · {{other}}';
    expect(
      fillNoteTemplate(markdown, { date: '2026-10-02', areaName: 'Work' }),
    ).toBe('Friday · Friday, October 2 · Work · {{other}}');
    expect(fillNoteTemplate(markdown, { date: '2026-10-02' })).toBe(
      'Friday · Friday, October 2 · {{area}} · {{other}}',
    );
  });
});

describe('filterNoteTemplates', () => {
  const all = [t('3', 'Retro'), t('1', 'HM Screen Interview'), t('2', '1:1')];

  test('sorts by name and keeps names holding every word', () => {
    expect(filterNoteTemplates(all, '').map((x) => x.name)).toEqual([
      '1:1',
      'HM Screen Interview',
      'Retro',
    ]);
    expect(filterNoteTemplates(all, 'interview hm').map((x) => x.id)).toEqual([
      '1',
    ]);
    expect(filterNoteTemplates(all, 'standup')).toEqual([]);
  });
});

describe('CreateNoteTemplateRequestSchema', () => {
  const id = '01JTMPAAAAAAAAAAAAAAAAAAA1';

  test('trims the name, needs one, and allows task lines', () => {
    expect(
      CreateNoteTemplateRequestSchema.parse({
        id,
        name: '  HM Screen ',
        bodyMarkdown: '[ ] Send feedback',
      }),
    ).toEqual({ id, name: 'HM Screen', bodyMarkdown: '[ ] Send feedback' });
    expect(
      CreateNoteTemplateRequestSchema.safeParse({ id, name: '  ' }).success,
    ).toBe(false);
  });

  test('limits the text by UTF-8 size', () => {
    const at = 'a'.repeat(NOTE_TEMPLATE_MAX_BYTES);
    expect(
      CreateNoteTemplateRequestSchema.safeParse({
        id,
        name: 'x',
        bodyMarkdown: at,
      }).success,
    ).toBe(true);
    expect(
      CreateNoteTemplateRequestSchema.safeParse({
        id,
        name: 'x',
        bodyMarkdown: `${at.slice(1)}é`,
      }).success,
    ).toBe(false);
  });
});

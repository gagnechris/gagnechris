import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_TEMPLATES,
  UpdateDailyTemplateRequestSchema,
  dailyTemplateHasTasks,
  fillDailyTemplate,
} from './daily-templates.js';

describe('fillDailyTemplate', () => {
  it("fills tokens for the note's own date and leaves unknown ones", () => {
    expect(
      fillDailyTemplate('{{weekday}} | {{date}} | {{area}} | {{x}}', {
        area: 'personal',
        date: '2026-10-09',
      }),
    ).toBe('Friday | Friday, October 9 | Personal | {{x}}');
  });

  it('fills the Work default heading', () => {
    expect(
      fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        area: 'work',
        date: '2026-10-12',
      }).split('\n')[0],
    ).toBe('## Focus for Monday');
  });
});

describe('dailyTemplateHasTasks', () => {
  it.each([
    ['[ ] call the bank', true],
    ['  [ ] indented', true],
    ['{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}', true],
    ['- [ ] checklist', false],
    ['- [ ] ', false],
    ['[ ]', false],
    ['```\n[ ] code\n```', false],
  ])('%j → %s', (markdown, expected) => {
    expect(dailyTemplateHasTasks(markdown)).toBe(expected);
  });

  it('the defaults hold no tasks', () => {
    expect(dailyTemplateHasTasks(DEFAULT_DAILY_TEMPLATES.work)).toBe(false);
    expect(dailyTemplateHasTasks(DEFAULT_DAILY_TEMPLATES.personal)).toBe(false);
    expect(
      UpdateDailyTemplateRequestSchema.safeParse({
        bodyMarkdown: DEFAULT_DAILY_TEMPLATES.personal,
      }).success,
    ).toBe(true);
  });
});

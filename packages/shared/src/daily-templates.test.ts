import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_TEMPLATES,
  UpdateDailyTemplateRequestSchema,
  carryIntoDailyTemplate,
  dailyTemplateHasTasks,
  dailyTemplateHeadings,
  defaultDailyTemplate,
  fillDailyTemplate,
} from './daily-templates.js';

const A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const B = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const t = (id: string) => `{{task:${id}}}`;

describe('fillDailyTemplate', () => {
  it("fills tokens for the note's own date and leaves unknown ones", () => {
    expect(
      fillDailyTemplate('{{weekday}} | {{date}} | {{area}} | {{x}}', {
        areaName: 'Personal',
        date: '2026-10-09',
      }),
    ).toBe('Friday | Friday, October 9 | Personal | {{x}}');
  });

  it('fills the Work default heading', () => {
    expect(
      fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work!, {
        areaName: 'Work',
        date: '2026-10-12',
      }).split('\n')[0],
    ).toBe('## Focus for Monday');
  });
});

describe('defaultDailyTemplate', () => {
  it('keeps the built-in Work and Personal templates and starts a new area blank', () => {
    expect(defaultDailyTemplate('work').bodyMarkdown).toBe(
      DEFAULT_DAILY_TEMPLATES.work,
    );
    expect(defaultDailyTemplate('personal').bodyMarkdown).toContain(
      '## Errands',
    );
    expect(defaultDailyTemplate('family')).toMatchObject({
      area: 'family',
      bodyMarkdown: '',
      isDefault: true,
      version: 0,
    });
    expect(defaultDailyTemplate('constructor').bodyMarkdown).toBe('');
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

describe('dailyTemplateHeadings', () => {
  it('lists each heading once, unfilled, skipping code and non-headings', () => {
    expect(dailyTemplateHeadings(DEFAULT_DAILY_TEMPLATES.work)).toEqual([
      'Focus for {{weekday}}',
      'Standup',
      'Meetings',
      'Notes',
      'Tomorrow',
    ]);
    expect(
      dailyTemplateHeadings('# A\n#B\n```\n## Code\n```\n## A\n##\n### C ##'),
    ).toEqual(['A', 'C']);
  });
});

describe('carryIntoDailyTemplate', () => {
  it('puts carried tasks at the end of the first section by default, in place of its empty list items', () => {
    expect(
      carryIntoDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, [{ id: A }], null),
    ).toBe(
      DEFAULT_DAILY_TEMPLATES.work.replace(
        '## Focus for {{weekday}}\n- \n\n',
        `## Focus for {{weekday}}\n${t(A)}\n\n`,
      ),
    );
    expect(
      carryIntoDailyTemplate(
        DEFAULT_DAILY_TEMPLATES.personal,
        [{ id: A }],
        null,
      ),
    ).toBe(`## Plans\n${t(A)}\n\n## Errands\n- [ ] \n\n## Notes\n`);
  });

  it('keeps the section content and drops only the empty list items that end it', () => {
    expect(
      carryIntoDailyTemplate(
        '## A\n- keep\n- \n\n* [ ] \n1. \n## B\n- \n',
        [{ id: A }],
        null,
      ),
    ).toBe(`## A\n- keep\n\n${t(A)}\n\n## B\n- \n`);
  });

  it('leaves the template alone when nothing carries in', () => {
    expect(carryIntoDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, [], null)).toBe(
      DEFAULT_DAILY_TEMPLATES.work,
    );
  });

  it('uses the chosen section, falling back to the first when it is gone, and nests subtasks', () => {
    const tasks = [{ id: B, parentId: A }, { id: A }];
    expect(carryIntoDailyTemplate('## A\nx\n## B\ny\n', tasks, 'B')).toBe(
      `## A\nx\n## B\ny\n\n${t(A)}\n  ${t(B)}\n`,
    );
    expect(carryIntoDailyTemplate('## A\nx\n## B\ny\n', tasks, 'Gone')).toBe(
      `## A\nx\n\n${t(A)}\n  ${t(B)}\n\n## B\ny\n`,
    );
  });

  it('adds a Carried in section when there is no heading', () => {
    expect(carryIntoDailyTemplate('', [{ id: A }], null)).toBe(
      `## Carried in\n\n${t(A)}\n\n`,
    );
    expect(carryIntoDailyTemplate('text\n', [{ id: A }], 'text')).toBe(
      `## Carried in\n\n${t(A)}\n\ntext\n`,
    );
  });
});

describe('UpdateDailyTemplateRequestSchema carryOverSection', () => {
  const parse = (carryOverSection: unknown) =>
    UpdateDailyTemplateRequestSchema.safeParse({
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.work,
      carryOverSection,
    }).success;

  it('accepts a heading of the template, null or nothing, and nothing else', () => {
    expect(parse('Meetings')).toBe(true);
    expect(parse('Focus for {{weekday}}')).toBe(true);
    expect(parse(null)).toBe(true);
    expect(parse(undefined)).toBe(true);
    expect(parse('Focus for Monday')).toBe(false);
    expect(parse('')).toBe(false);
  });
});

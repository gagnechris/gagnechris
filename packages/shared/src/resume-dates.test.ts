import { describe, expect, it } from 'vitest';
import {
  LEGACY_COMPANY_LINES,
  legacyResume,
  legacyResumeContent,
} from './fixtures/legacy-resume.js';
import { DEFAULT_RESUME } from './resume-default.js';
import {
  experienceCompanyLine,
  formatResumeMonth,
  formatResumeShortMonth,
  parseLegacyCompanyLine,
  planResumeDateMigration,
  resumeRoleDates,
} from './resume-dates.js';
import {
  renderResumeBodyHtml,
  renderResumeSectionsHtml,
} from './resume-html.js';
import { resumeView } from './resume-view.js';
import {
  ResumeContentSchema,
  ResumeExperienceSchema,
  ResumeSchema,
} from './schemas.js';

describe('parseLegacyCompanyLine', () => {
  it('parses every stored format into a bare company and YYYY-MM dates', () => {
    expect(
      LEGACY_COMPANY_LINES.map((line) => parseLegacyCompanyLine(line)),
    ).toEqual(
      DEFAULT_RESUME.content.experience.map(({ company, start, end }) => ({
        ok: true,
        company,
        start,
        end,
      })),
    );
    expect(parseLegacyCompanyLine('Ro | July 2019 - Present')).toEqual({
      ok: true,
      company: 'Ro',
      start: '2019-07',
      end: null,
    });
  });

  it.each([
    ['Ro', 'no "Company | Month YYYY - …"'],
    ['Ro | Sept 2014 - March 2017', 'unknown start month'],
    ['Ro | July 2019 - Someday', 'unparseable end date'],
    ['Ro | July 2019 – Present', 'no "Company | Month YYYY - …"'],
    ['Ro | July 2019 - present', 'would render differently'],
    ['Ro |  July 2019 - Present', 'would render differently'],
    ['Ro | March 2017 - July 2015', 'end is before start'],
    ['A | B | July 2019 - Present', 'more than one "|"'],
  ])('reports %j instead of guessing', (line, reason) => {
    expect(parseLegacyCompanyLine(line)).toEqual({ ok: false, reason });
  });
});

describe('experienceCompanyLine', () => {
  it('rebuilds the stored line from structured dates', () => {
    expect(
      experienceCompanyLine({ company: 'Ro', start: '2019-07', end: null }),
    ).toBe('Ro | July 2019 - Present');
    expect(
      experienceCompanyLine({
        company: 'JW Player',
        start: '2017-03',
        end: '2019-07',
      }),
    ).toBe('JW Player | March 2017 - July 2019');
    expect(formatResumeMonth('1999-01')).toBe('January 1999');
  });

  it('leaves old-shape rows as stored', () => {
    expect(experienceCompanyLine({ company: 'Ro | July 2019 - Present' })).toBe(
      'Ro | July 2019 - Present',
    );
  });
});

describe('planResumeDateMigration', () => {
  it('turns the old-shape resume into the structured one', () => {
    const plan = planResumeDateMigration(legacyResumeContent());
    expect(plan.changed).toBe(true);
    expect(plan.content.experience).toEqual(DEFAULT_RESUME.content.experience);
    expect(plan.rows.map((r) => r.status)).toEqual(
      LEGACY_COMPANY_LINES.map(() => 'migrated'),
    );
  });

  it('is a no-op on migrated content', () => {
    const migrated = planResumeDateMigration(legacyResumeContent()).content;
    const again = planResumeDateMigration(migrated);
    expect(again.changed).toBe(false);
    expect(again.content).toBe(migrated);
    expect(again.rows.every((r) => r.status === 'already')).toBe(true);
  });

  it('leaves unparseable rows untouched and reports them', () => {
    const content = legacyResumeContent();
    content.experience[1]!.company = 'JW Player | Spring 2017 - July 2019';
    const plan = planResumeDateMigration(content);
    expect(plan.content.experience[1]).toEqual(content.experience[1]);
    expect(plan.rows[1]).toEqual({
      index: 1,
      status: 'unparseable',
      company: 'JW Player | Spring 2017 - July 2019',
      reason: 'unknown start month',
    });
    expect(plan.content.experience[0]!.start).toBe('2019-07');
  });
});

describe('resume renders the same before and after migration', () => {
  it('section HTML is identical for the old and migrated shapes', () => {
    const legacy = legacyResumeContent();
    const migrated = planResumeDateMigration(legacy).content;
    expect(renderResumeSectionsHtml(migrated)).toBe(
      renderResumeSectionsHtml(legacy),
    );
    const {
      headline: _headline,
      earlierRolesThrough: _cutoff,
      ...unset
    } = DEFAULT_RESUME.content;
    expect(renderResumeSectionsHtml(unset)).toBe(
      renderResumeSectionsHtml(legacy),
    );
  });

  it('the published page is identical for the old and migrated shapes', () => {
    const legacy = legacyResume();
    const migrated = {
      ...legacy,
      content: planResumeDateMigration(legacy.content).content,
    };
    expect(renderResumeBodyHtml(migrated)).toBe(renderResumeBodyHtml(legacy));
  });
});

describe('resume schema compatibility', () => {
  it('old-shape rows still parse', () => {
    expect(ResumeSchema.safeParse(legacyResume()).success).toBe(true);
    expect(ResumeContentSchema.safeParse(legacyResumeContent()).success).toBe(
      true,
    );
  });

  it('accepts the structured fields', () => {
    expect(
      ResumeExperienceSchema.parse({
        title: 'Architect',
        company: 'Viacom',
        start: '2014-09',
        end: '2015-04',
        note: 'contract, concurrent',
        bullets: [],
      }),
    ).toMatchObject({ start: '2014-09', end: '2015-04' });
    expect(ResumeSchema.safeParse(DEFAULT_RESUME).success).toBe(true);
  });

  it.each([
    [{ start: '2019-7' }, ['start']],
    [{ start: '2019-13' }, ['start']],
    [{ end: '2019-07' }, ['end']],
    [{ start: '2019-07', end: '2019-06' }, ['end']],
  ])('rejects %j', (dates, path) => {
    const result = ResumeExperienceSchema.safeParse({
      title: 't',
      company: 'c',
      bullets: [],
      ...dates,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(path);
  });

  it('rejects a cut-off that is not a year', () => {
    expect(
      ResumeContentSchema.safeParse({
        ...DEFAULT_RESUME.content,
        earlierRolesThrough: 12,
      }).success,
    ).toBe(false);
  });
});

describe('resume page dates and earlier roles', () => {
  it('formats the date column with short months and an en dash', () => {
    expect(formatResumeShortMonth('2019-07')).toBe('Jul 2019');
    expect(resumeRoleDates({ start: '2019-07', end: null })).toBe(
      'Jul 2019 – Present',
    );
    expect(resumeRoleDates({ start: '2017-03', end: '2019-07' })).toBe(
      'Mar 2017 – Jul 2019',
    );
    expect(resumeRoleDates({})).toBe('');
  });

  it('reads old-shape rows through the legacy parser', () => {
    const view = resumeView({
      content: { ...legacyResumeContent(), earlierRolesThrough: 2012 },
    });
    const earlier = view.roles.filter((r) => r.earlier);
    expect(view.earlierLabel).toBe('Earlier roles, 1999–2012');
    expect(earlier.map((r) => r.company)).toEqual([
      'Dealertrack',
      'Dealertrack',
      'Psyche Systems Corporation',
      'Daystar Corporation',
    ]);
    expect(view.roles[0]).toMatchObject({
      company: 'Ro',
      end: null,
      earlier: false,
    });
  });

  it('counts a role that ended in the cut-off year as earlier, and not one that ended after it', () => {
    const role = (end: string) => ({
      title: 't',
      company: end,
      start: '2010-01',
      end,
      bullets: [],
    });
    const view = resumeView({
      content: {
        ...legacyResumeContent(),
        experience: [role('2012-12'), role('2013-01')],
        earlierRolesThrough: 2012,
      },
    });
    expect(view.roles.map((r) => [r.end, r.earlier])).toEqual([
      ['2012-12', true],
      ['2013-01', false],
    ]);
    expect(view.earlierLabel).toBe('Earlier roles, 2010–2012');
  });

  it('keeps every role recent without a cut-off', () => {
    const view = resumeView({ content: legacyResumeContent() });
    expect(view.roles.some((r) => r.earlier)).toBe(false);
    expect(view.earlierLabel).toBeNull();
    expect(view.roles).toHaveLength(LEGACY_COMPANY_LINES.length);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from './resume-default.js';
import { RESUME_SECTION_LABELS, resumeView } from './resume-view.js';
import type { ResumeContent } from './schemas.js';

const content = (overrides: Partial<ResumeContent>): ResumeContent => ({
  ...DEFAULT_RESUME.content,
  ...overrides,
});

describe('resumeView', () => {
  it('gives a blank company as null and collapses whitespace in the heading', () => {
    const [blank, named] = resumeView({
      content: content({
        experience: [
          { title: ' Lead   Engineer ', company: ' \t', bullets: [] },
          { title: 'Engineer', company: ' Acme  Co ', bullets: [' a  b '] },
        ],
      }),
    }).roles;
    expect(blank).toMatchObject({ title: 'Lead Engineer', company: null });
    expect(named).toMatchObject({
      title: 'Engineer',
      company: 'Acme Co',
      bullets: ['a b'],
    });
  });

  it('splits skill rows on the first colon; a line without one is value only', () => {
    expect(
      resumeView({
        content: content({
          skills: [' Languages :  Python, SQL ', 'No label here', ':x'],
        }),
      }).skills,
    ).toEqual([
      { label: 'Languages', value: 'Python, SQL' },
      { label: '', value: 'No label here' },
      { label: '', value: ':x' },
    ]);
  });

  it('joins the degree detail into the title and drops blank place parts', () => {
    expect(
      resumeView({
        content: content({
          education: [
            {
              title: 'BS',
              degreeDetail: 'Computer Science',
              institution: ' State  University ',
              location: ' ',
              year: ' 2000 ',
            },
          ],
        }),
      }).education,
    ).toEqual([
      {
        year: '2000',
        title: 'BS, Computer Science',
        place: 'State University',
      },
    ]);
  });

  it('carries the section labels', () => {
    expect(resumeView(DEFAULT_RESUME).labels).toEqual(RESUME_SECTION_LABELS);
  });
});

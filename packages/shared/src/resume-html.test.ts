import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from './resume-default.js';
import {
  renderResumePrerenderHtml,
  renderResumeSectionsHtml,
  renderResumeUnavailablePrerenderHtml,
  resumeSummaryExcerpt,
} from './resume-html.js';
import type { Resume, ResumeContent } from './schemas.js';

const resume = (overrides: Partial<Resume> = {}): Resume => ({
  ...DEFAULT_RESUME,
  ...overrides,
});

const {
  headline: _headline,
  earlierRolesThrough: _cutoff,
  ...UNSET
} = DEFAULT_RESUME.content;

const content = (overrides: Partial<ResumeContent> = {}): ResumeContent => ({
  ...UNSET,
  ...overrides,
});

const count = (html: string, needle: string): number =>
  html.split(needle).length - 1;

describe('renderResumeSectionsHtml', () => {
  it('renders Experience, Strengths and skills, and Education with a date column', () => {
    const html = renderResumeSectionsHtml(content());
    expect(html).toContain(
      '<h2 class="resume-section__label" id="resume-experience">Experience</h2>',
    );
    expect(html).toContain('>Strengths and skills</h2>');
    expect(html).toContain('>Education</h2>');
    expect(html).toContain(
      '<li class="resume-role"><p class="resume-role__dates">Jul 2019 – Present</p>' +
        '<div class="resume-role__body"><h3 class="resume-role__title">Director of Software Engineering <span class="resume-role__company">at Ro</span></h3>' +
        '<ul class="resume-role__bullets"><li>Dedicated to aligning',
    );
    expect(html).toContain(
      '<p class="resume-role__dates">Jan 1999 – Apr 2000</p>',
    );
  });

  it('keeps every role expanded when the cut-off is unset', () => {
    const html = renderResumeSectionsHtml(content());
    expect(html).not.toContain('<details');
    expect(html).not.toContain('Earlier roles');
    expect(count(html, '<h3 class="resume-role__title">')).toBe(
      UNSET.experience.length,
    );
  });

  it('puts roles that ended in or before the cut-off year in <details>, with their full content', () => {
    const html = renderResumeSectionsHtml(
      content({ earlierRolesThrough: 2012 }),
    );
    const [recent, earlier] = html.split('<div class="resume-earlier">');
    expect(earlier).toContain(
      '<details class="resume-earlier__details"><summary class="resume-earlier__summary">' +
        '<span class="resume-earlier__label">Earlier roles, 1999–2012</span>' +
        '<span class="resume-earlier__toggle"><span class="resume-earlier__show">Show details</span><span class="resume-earlier__hide">Hide details</span></span></summary>',
    );
    // Dealertrack 2010-08 → 2012-06 ended in the cut-off year; Getty started in it.
    expect(earlier).toContain('Aug 2010 – Jun 2012');
    expect(recent).not.toContain('Aug 2010 – Jun 2012');
    expect(recent).toContain('at Getty Images');
    for (const role of UNSET.experience.slice(5)) {
      expect(earlier).toContain(`at ${role.company}</span>`);
      for (const bullet of role.bullets) {
        expect(earlier).toContain(bullet.replace(/&/g, '&amp;'));
      }
      expect(recent).not.toContain(role.bullets[0]!);
    }
    expect(count(earlier!, '<li class="resume-earlier__item">')).toBe(4);
  });

  it('labels earlier roles from the first start year to the cut-off', () => {
    const html = renderResumeSectionsHtml(
      content({ earlierRolesThrough: 2014 }),
    );
    expect(html).toContain('Earlier roles, 1999–2014');
    const earlier = html.split('<div class="resume-earlier">')[1]!;
    expect(earlier).toContain('at Getty Images');
    expect(earlier).not.toContain('at Viacom');
    expect(earlier).not.toContain('at Shutterstock');
  });

  it('has no earlier section when no role ended before the cut-off', () => {
    const html = renderResumeSectionsHtml(
      content({ earlierRolesThrough: 1990 }),
    );
    expect(html).not.toContain('resume-earlier');
  });

  it('never moves a current role', () => {
    const html = renderResumeSectionsHtml(
      content({ earlierRolesThrough: 2100 }),
    );
    const [recent, earlier] = html.split('<div class="resume-earlier">');
    expect(recent).toContain('at Ro</span>');
    expect(earlier).not.toContain('at Ro</span>');
  });

  it('shows the note under the dates', () => {
    const html = renderResumeSectionsHtml(
      content({
        experience: [
          {
            title: 'Software Architect',
            company: 'Viacom',
            start: '2014-09',
            end: '2015-04',
            note: 'contract, concurrent',
            bullets: [],
          },
        ],
      }),
    );
    expect(html).toContain(
      '<p class="resume-role__dates">Sep 2014 – Apr 2015<span class="resume-role__note">contract, concurrent</span></p>',
    );
    expect(html).not.toContain('resume-role__bullets');
  });

  it('joins competencies with dots and splits skills into label and value', () => {
    const html = renderResumeSectionsHtml(
      content({
        competencies: ['Roadmaps', 'Team building'],
        skills: ['Languages: Python, SQL', 'No label here'],
      }),
    );
    expect(html).toContain(
      '<p class="resume-competencies">Roadmaps · Team building</p>',
    );
    expect(html).toContain(
      '<div class="resume-skill"><dt>Languages</dt><dd>Python, SQL</dd></div>',
    );
    expect(html).toContain(
      '<div class="resume-skill"><dt></dt><dd>No label here</dd></div>',
    );
  });

  it('puts the free-text education year in the date column as stored', () => {
    const html = renderResumeSectionsHtml(content());
    expect(html).toContain(
      '<p class="resume-role__dates">December 2006</p><div class="resume-role__body"><h3 class="resume-education__title">Bachelor&#39;s Degree in Business Management</h3>' +
        '<p class="resume-education__place">New England Institute of Technology, Warwick, RI</p>',
    );
    expect(html).toContain(
      'Associate&#39;s Degree, Computer and Network Servicing Technology',
    );
  });

  it('escapes HTML in every text field', () => {
    const html = renderResumeSectionsHtml({
      summary: 'x',
      competencies: ['a & b'],
      experience: [
        {
          title: '<b>Lead</b>',
          company: 'Ro & Co',
          start: '2020-01',
          end: '2021-01',
          note: '<i>n</i>',
          bullets: ['5 > 3'],
        },
      ],
      earlierRolesThrough: 2022,
      skills: ["it's: <fine>"],
      education: [
        {
          title: '<i>BS</i>',
          institution: 'A & M',
          location: 'X',
          year: '<2000>',
        },
      ],
    });
    expect(html).not.toMatch(/<(b|i|fine)>/);
    expect(html).toContain('&lt;b&gt;Lead&lt;/b&gt;');
    expect(html).toContain('at Ro &amp; Co');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('5 &gt; 3');
    expect(html).toContain('<dt>it&#39;s</dt><dd>&lt;fine&gt;</dd>');
    expect(html).toContain('&lt;2000&gt;');
  });
});

describe('renderResumePrerenderHtml', () => {
  it('renders the intro: title, italic headline, summary, Download PDF, LinkedIn, Get in touch', () => {
    const html = renderResumePrerenderHtml(resume());
    expect(html).toContain(
      '<main class="resume-page resume-page-prerender"><header class="resume-intro">' +
        '<h1 class="resume-intro__title">Resume</h1>' +
        '<p class="resume-intro__headline">Director of Software Engineering</p>' +
        '<p class="resume-intro__summary">Results-driven',
    );
    expect(html).toContain(
      '<a class="resume-download" href="/resume.pdf" download="Chris-Gagne-Resume.pdf"><svg',
    );
    expect(html).toContain('</svg>Download PDF</a>');
    expect(html).toContain(
      '<a class="resume-intro__link" href="https://www.linkedin.com/in/christophergagne/" target="_blank" rel="noopener noreferrer">LinkedIn</a>',
    );
    expect(html).toContain(
      '<a class="resume-intro__link" href="/contact">Get in touch</a>',
    );
    expect(html).toContain('<div class="resume-body">');
    expect(html).toMatch(/<\/div><\/main><footer class="site-footer">/);
  });

  it('omits the headline line when it is unset or blank', () => {
    for (const headline of [undefined, '  ']) {
      const html = renderResumePrerenderHtml(
        resume({
          content: content(headline === undefined ? {} : { headline }),
        }),
      );
      expect(html).not.toContain('resume-intro__headline');
      expect(html).toContain('<p class="resume-intro__summary">');
    }
  });

  it("preserves $$, $&, $`, $' in headline and summary", () => {
    const html = renderResumePrerenderHtml(
      resume({
        content: content({
          headline: "Making $$$ with $$ and $& and $` and $'",
          summary: "echo $$ and $& and $` and $'",
        }),
      }),
    );
    expect(html).toContain('Making $$$ with $$ and $&amp; and $` and $&#39;');
    expect(html).toContain('echo $$ and $&amp; and $` and $&#39;');
  });

  it('escapes quotes in the pdf link', () => {
    const html = renderResumePrerenderHtml(resume({ pdfPath: '/a"b.pdf' }));
    expect(html).toContain('href="/a&quot;b.pdf"');
  });
});

describe('renderResumeUnavailablePrerenderHtml', () => {
  it('says the resume is available on request, with no download', () => {
    const html = renderResumeUnavailablePrerenderHtml();
    expect(html).toContain('resume-page-unavailable');
    expect(html).toContain(
      '<p class="resume-intro__summary">Resume available on request.</p>',
    );
    expect(html).not.toContain('resume-download');
    expect(html).toContain(
      '<main class="resume-page resume-page-unavailable">',
    );
    expect(html).toContain('>Get in touch</a>');
  });
});

describe('resumeSummaryExcerpt', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    expect(resumeSummaryExcerpt('  one   two  ')).toBe('one two');
    const long = resumeSummaryExcerpt('word '.repeat(80));
    expect(long.length).toBeLessThanOrEqual(201);
    expect(long.endsWith('…')).toBe(true);
  });
});

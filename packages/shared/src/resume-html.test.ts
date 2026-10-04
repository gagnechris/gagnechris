import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from './resume-default.js';
import {
  renderResumePrerenderHtml,
  renderResumeSectionsHtml,
  resumeSummaryExcerpt,
} from './resume-html.js';
import type { Resume } from './schemas.js';

const resume = (overrides: Partial<Resume> = {}): Resume => ({
  ...DEFAULT_RESUME,
  ...overrides,
});

describe('renderResumeSectionsHtml', () => {
  it('renders every section with the Resume.css class names', () => {
    const html = renderResumeSectionsHtml(DEFAULT_RESUME.content);
    expect(html).toContain('<section class="resume-summary"><h2>Summary</h2>');
    expect(html).toContain('<h2>Core Competencies</h2>');
    expect(html).toContain('<div class="experience-item">');
    expect(html).toContain('<p class="company">Ro | July 2019 - Present</p>');
    expect(html).toContain('<ul class="experience-list">');
    expect(html).toContain('<h2>Technical Skills</h2>');
    expect(html).toContain('<div class="education-item">');
    expect(html).toContain(
      '<p class="degree-detail">Computer and Network Servicing Technology</p>',
    );
  });

  it('splits competencies into two columns past four items', () => {
    const columnCount = (competencies: string[]): number => {
      const html = renderResumeSectionsHtml({
        ...DEFAULT_RESUME.content,
        competencies,
      });
      const section = /<h2>Core Competencies<\/h2>([\s\S]*?)<\/section>/.exec(
        html,
      );
      return section![1]!.match(/<ul class="competencies-list">/g)!.length;
    };

    expect(columnCount(['a', 'b', 'c', 'd'])).toBe(1);
    expect(columnCount(['a', 'b', 'c', 'd', 'e'])).toBe(2);
  });

  it('escapes HTML in every text field', () => {
    const html = renderResumeSectionsHtml({
      summary: '<script>alert("x")</script>',
      competencies: ['a & b'],
      experience: [
        {
          title: '<b>Lead</b>',
          company: 'Ro & Co',
          bullets: ['5 > 3'],
        },
      ],
      skills: ["it's fine"],
      education: [
        {
          title: '<i>BS</i>',
          institution: 'A & M',
          location: 'X',
          year: '2000',
        },
      ],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('5 &gt; 3');
    expect(html).toContain('it&#39;s fine');
  });
});

describe('renderResumePrerenderHtml', () => {
  it('exposes name and pdf path as data attributes the SPA reads back', () => {
    const html = renderResumePrerenderHtml(resume());
    expect(html).toContain('class="resume-page resume-page-prerender"');
    expect(html).toContain('data-name="Chris Gagne"');
    expect(html).toContain('data-pdf="/resume.pdf"');
    expect(html).toContain('<h1>Chris Gagne</h1>');
    expect(html).toContain('<main>');
  });

  it("preserves $$, $&, $`, $' in name and summary", () => {
    const tricky = "Making $$$ with $$ and $& and $` and $'";
    const escaped = 'Making $$$ with $$ and $&amp; and $` and $&#39;';
    const html = renderResumePrerenderHtml(
      resume({
        name: tricky,
        content: {
          ...DEFAULT_RESUME.content,
          summary: "echo $$ and $& and $` and $'",
        },
      }),
    );
    expect(html).toContain(`data-name="${escaped}"`);
    expect(html).toContain(`<h1>${escaped}</h1>`);
    expect(html).toContain('echo $$ and $&amp; and $` and $&#39;');
  });

  it('escapes quotes in data attributes', () => {
    const html = renderResumePrerenderHtml(
      resume({ name: 'A "B"', pdfPath: '/a"b.pdf' }),
    );
    expect(html).toContain('data-name="A &quot;B&quot;"');
    expect(html).toContain('data-pdf="/a&quot;b.pdf"');
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

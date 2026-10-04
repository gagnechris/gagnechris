import { describe, expect, it } from 'vitest';
import {
  renderProjectPageBodyHtml,
  renderProjectsIndexBodyHtml,
} from './project-html.js';
import { projectCardHref, projectHasPage } from './projects.js';
import type { Project } from './schemas.js';

const base: Project = {
  id: '01A',
  slug: 'notebook',
  name: 'Notebook',
  pitch: 'Notes and tasks',
  stage: 'building',
  stageNote: 'since 2026',
  previewImage: null,
  bodyMarkdown: 'Body',
  stack: ['TypeScript', 'DynamoDB'],
  links: [{ label: 'Source', url: 'https://github.com/gagnechris' }],
  demo: null,
  order: 1,
  href: null,
  status: 'published',
  publishedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

describe('project pages', () => {
  it('decide which projects get a page and where cards link', () => {
    expect(projectHasPage(base)).toBe(true);
    expect(projectCardHref(base)).toBe('/projects/notebook');
    const idea = { ...base, stage: 'idea' as const, bodyMarkdown: ' \n' };
    expect(projectHasPage(idea)).toBe(false);
    expect(projectCardHref(idea)).toBeNull();
    expect(projectHasPage({ ...idea, bodyMarkdown: 'Why' })).toBe(true);
    const bears = { ...base, href: '/dont-feed-the-bears' };
    expect(projectHasPage(bears)).toBe(false);
    expect(projectCardHref(bears)).toBe('/dont-feed-the-bears');
  });

  it('lists projects by order with the stage as text', () => {
    const html = renderProjectsIndexBodyHtml([
      { ...base, id: '02B', slug: 'b', name: 'B', order: 2 },
      { ...base, id: '01A', slug: 'a', name: 'A', order: 1, stage: 'live' },
    ]);
    expect(html.indexOf('>A</a>')).toBeLessThan(html.indexOf('>B</a>'));
    expect(html).toContain(
      '<p class="project-stage" data-stage="live">Live, since 2026</p>',
    );
  });

  it('renders the body as sanitized markdown with stack and links', () => {
    const html = renderProjectPageBodyHtml(base);
    expect(html).toContain('<h1>Notebook</h1>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('TypeScript · DynamoDB');
    expect(html).toContain(
      '<a href="https://github.com/gagnechris">Source</a>',
    );
    expect(html).toContain('<a href="/projects">Projects</a>');
  });
});

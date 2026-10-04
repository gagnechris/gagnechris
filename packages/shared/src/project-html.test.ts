import { describe, expect, it } from 'vitest';
import {
  renderProjectPageBodyHtml,
  renderProjectsIndexBodyHtml,
} from './project-html.js';
import { SAMPLE_PROJECTS } from './fixtures/sample-projects.js';
import {
  projectCardHref,
  projectHasPage,
  selectHomeProjects,
} from './projects.js';
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
    expect(html.indexOf('>A</h2>')).toBeLessThan(html.indexOf('>B</h2>'));
    expect(html).toContain(
      '<p class="project-stage" data-stage="live">Live · since 2026</p>',
    );
    expect(html).toContain(
      '<p class="project-stage" data-stage="building">Building · since 2026</p>',
    );
  });

  it('makes each card one link to its page or href, and leaves a pageless idea unlinked', () => {
    const html = renderProjectsIndexBodyHtml(SAMPLE_PROJECTS);
    const cards = html.split('<li class="project-card"').slice(1);
    expect(cards.map((c) => (c.match(/<a /g) ?? []).length)).toEqual([
      1, 1, 1, 0,
    ]);
    expect(cards[0]).toMatch(
      /^[^>]*><a class="project-card__link" href="\/projects\/posts">/,
    );
    expect(cards[2]).toContain('href="/dont-feed-the-bears"');
    expect(cards[3]).toContain('<div class="project-card__link">');
    expect(cards[3]).not.toContain('tabindex');
  });

  it('has an empty state, so /projects is never a 404', () => {
    const html = renderProjectsIndexBodyHtml([]);
    expect(html).toContain('<h1>Projects</h1>');
    expect(html).toContain(
      '<p class="projects-index__empty">Nothing to show yet. The first project is on its way.</p>',
    );
    expect(html).not.toContain('project-list');
  });

  it('escapes card fields and the preview image', () => {
    const html = renderProjectsIndexBodyHtml([
      {
        ...base,
        name: '<script>x</script>',
        pitch: '"><img onerror=1>',
        stageNote: '<b>',
        stack: ['<i>'],
        previewImage: '/media/a"b.png',
        href: '/x"y',
      },
    ]);
    expect(html).not.toMatch(/<script>|<img onerror|<b>|<i>|a"b|x"y/);
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

describe('selectHomeProjects', () => {
  it('takes the first two non-idea projects by order', () => {
    expect(selectHomeProjects(SAMPLE_PROJECTS).map((p) => p.slug)).toEqual([
      'posts',
      'notebook',
    ]);
    expect(
      selectHomeProjects(SAMPLE_PROJECTS.filter((p) => p.stage === 'idea')),
    ).toEqual([]);
  });
});

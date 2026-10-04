import { describe, expect, it } from 'vitest';
import {
  projectPageView,
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
    const html = renderProjectPageBodyHtml(projectPageView(base));
    expect(html).toContain('<h1>Notebook</h1>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain(
      '<p class="project-stack"><span>TypeScript</span> · <span>DynamoDB</span></p>',
    );
    expect(html).toContain(
      '<a href="https://github.com/gagnechris">Source</a>',
    );
    expect(html).toContain(
      '<p class="project-back"><a href="/projects">Projects</a></p>',
    );
    expect(html).toContain(
      '<p class="project-stage" data-stage="building">Building · since 2026</p>',
    );
  });

  it('drops links the sanitizer would not allow', () => {
    const html = renderProjectPageBodyHtml(
      projectPageView({
        ...base,
        links: [
          { label: 'Bad', url: 'javascript:alert(1)' },
          { label: 'Good', url: '/posts' },
        ],
      }),
    );
    expect(html).not.toContain('Bad');
    expect(html).toContain('<li><a href="/posts">Good</a></li>');
  });
});

describe('project page prerender', () => {
  const log = [
    {
      id: '01B',
      slug: 'newer',
      title: 'Newer & better',
      publishedAt: '2026-03-02T10:00:00.000Z',
    },
    {
      id: '01A',
      slug: 'welcome',
      title: 'Welcome',
      publishedAt: '2026-02-01T00:00:00.000Z',
    },
  ];

  it('has the full body and the Build log, newest first with full dates', () => {
    const html = renderProjectPageBodyHtml(
      projectPageView(
        {
          ...base,
          bodyMarkdown:
            '## Why I built it\n\nBecause.\n\n## How it’s built\n\n1. Write.\n2. Publish.',
        },
        log,
      ),
    );
    expect(html).toContain('<h2>Why I built it</h2>');
    expect(html).toContain('<li>Publish.</li>');
    const section =
      /<section class="project-build-log"[\s\S]*?<\/section>/.exec(html)![0];
    expect(section).toBe(
      '<section class="project-build-log" aria-labelledby="project-build-log">' +
        '<h2 id="project-build-log">Build log</h2>' +
        '<ul class="project-build-log__list">' +
        '<li class="project-build-log__entry" data-id="01B"><a class="project-build-log__link" href="/posts/newer"><h3 class="project-build-log__title">Newer &amp; better</h3><time class="project-build-log__date" datetime="2026-03-02">March 2, 2026</time></a></li>' +
        '<li class="project-build-log__entry" data-id="01A"><a class="project-build-log__link" href="/posts/welcome"><h3 class="project-build-log__title">Welcome</h3><time class="project-build-log__date" datetime="2026-02-01">February 1, 2026</time></a></li>' +
        '</ul></section>',
    );
  });

  it('has an empty Build log that points to RSS', () => {
    const html = renderProjectPageBodyHtml(projectPageView(base));
    expect(html).toContain(
      '<p class="project-build-log__empty">No posts about Notebook yet. <a href="/rss.xml">Follow along via RSS</a>.</p>',
    );
    expect(html).not.toContain('project-build-log__list');
  });

  it('has no demo slot when no demo is set', () => {
    const html = renderProjectPageBodyHtml(
      projectPageView({ ...base, previewImage: '/media/p.png' }),
    );
    expect(html).not.toContain('project-demo');
    expect(html).not.toContain('Try it');
    expect(html).not.toContain('data-demo');
    expect(html).not.toContain('/media/p.png');
  });

  it('with a demo, the slot shows the preview image (or the mini-UI without one)', () => {
    const withImage = renderProjectPageBodyHtml(
      projectPageView({
        ...base,
        demo: 'notebook',
        previewImage: '/media/p.png',
      }),
    );
    expect(withImage).toContain(
      '<div class="project-page" data-slug="notebook" data-demo="notebook">',
    );
    expect(withImage).toContain(
      '<section class="project-demo" aria-labelledby="project-demo-label">' +
        '<h2 class="project-demo__label" id="project-demo-label">Try it</h2>' +
        '<div class="project-demo__stage"><div class="project-preview project-preview--image">' +
        '<img alt="" width="240" height="160" src="/media/p.png"></div></div></section>',
    );
    const withoutImage = renderProjectPageBodyHtml(
      projectPageView({ ...base, demo: 'posts' }),
    );
    expect(withoutImage).toContain(
      '<div class="project-demo__stage"><div class="project-preview project-preview--posts" aria-hidden="true">',
    );
    // The slot sits between the header and the body.
    expect(
      withoutImage.indexOf('</header><section class="project-demo"'),
    ).toBeGreaterThan(-1);
    expect(withoutImage.indexOf('project-demo')).toBeLessThan(
      withoutImage.indexOf('project-body'),
    );
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

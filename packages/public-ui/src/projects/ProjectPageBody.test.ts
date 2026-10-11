import { describe, expect, it } from 'vitest';
import type { Project } from '@gagnechris/shared';
import { projectPageView } from '@gagnechris/shared/render';
import { renderProjectPageBodyHtml } from '../server.js';

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

describe('ProjectPageBody', () => {
  it('renders the body as sanitized markdown with stack and links', () => {
    const html = renderProjectPageBodyHtml(projectPageView(base));
    expect(html).toContain('<h1>Notebook</h1>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain(
      '<p class="project-stack"><span>TypeScript</span> · <span>DynamoDB</span></p>',
    );
    expect(html).toContain(
      '<ul class="project-links"><li><a href="https://github.com/gagnechris">Source</a></li></ul>',
    );
    expect(html).toContain(
      '<p class="project-back"><a href="/projects">Projects</a></p>',
    );
    expect(html).toContain(
      '<p class="project-stage" data-stage="building">Building · since 2026</p>',
    );
  });

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
        '<li class="project-build-log__entry" data-id="01B"><a class="project-build-log__link" href="/posts/newer"><h3 class="project-build-log__title">Newer &amp; better</h3><time class="project-build-log__date" dateTime="2026-03-02">March 2, 2026</time></a></li>' +
        '<li class="project-build-log__entry" data-id="01A"><a class="project-build-log__link" href="/posts/welcome"><h3 class="project-build-log__title">Welcome</h3><time class="project-build-log__date" dateTime="2026-02-01">February 1, 2026</time></a></li>' +
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

  it('with a demo, the slot shows the preview image (or the mini-UI without one), with no image preload', () => {
    const withImage = renderProjectPageBodyHtml(
      projectPageView({
        ...base,
        demo: 'notebook',
        previewImage: '/media/p.png',
      }),
    );
    expect(withImage).toMatch(
      /^<main class="project-page" data-slug="notebook" data-demo="notebook">/,
    );
    expect(withImage).toContain(
      '<section class="project-demo" aria-labelledby="project-demo-label">' +
        '<h2 class="project-demo__label" id="project-demo-label">Try it</h2>' +
        '<div class="project-demo__stage"><div class="project-preview project-preview--image">' +
        '<img alt="" width="240" height="160" fetchPriority="low" src="/media/p.png"/></div></div></section>',
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

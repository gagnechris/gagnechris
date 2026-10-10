import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  projectPageView,
} from '@gagnechris/shared/render';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import {
  renderContactPageHtml,
  renderHomePrerenderHtml,
  renderNotFoundPageHtml,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  renderProjectPagePrerenderHtml,
  renderProjectsIndexPrerenderHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
} from './server.js';

const post = {
  id: '01P',
  slug: 'hello',
  title: 'Hello',
  excerpt: 'Hi.',
  publishedAt: '2026-02-01T00:00:00.000Z',
  bodyMarkdown: '## Section\n\nBody.',
};
const project = SAMPLE_PROJECTS.find((p) => p.slug === 'notebook')!;

const PAGES: [string, string][] = [
  [
    '/',
    renderHomePrerenderHtml(
      DEFAULT_HOME,
      [post],
      [{ ...project, href: '/projects/notebook' }],
    ),
  ],
  ['/posts', renderSitePageHtml('/posts', renderPostsIndexBodyHtml([post]))],
  [
    '/posts/hello',
    renderSitePageHtml('/posts', renderPostPageBodyHtml(post, [project])),
  ],
  ['/projects', renderProjectsIndexPrerenderHtml(SAMPLE_PROJECTS)],
  [
    '/projects/notebook',
    renderProjectPagePrerenderHtml(projectPageView(project, [post])),
  ],
  ['/resume', renderResumePrerenderHtml(DEFAULT_RESUME)],
  ['/resume unpublished', renderResumeUnavailablePrerenderHtml()],
  ['/contact', renderContactPageHtml()],
  ['404', renderNotFoundPageHtml()],
];

const count = (html: string, tag: string) => html.split(tag).length - 1;

describe('every public page is header, one <main> holding its <h1>, footer', () => {
  it.each(PAGES)('%s', (_page, html) => {
    expect(html).toMatch(
      /^<header class="site-header">.*<\/header><main[ >].*<\/main><footer class="site-footer">.*<\/footer>$/s,
    );
    expect(count(html, '<main')).toBe(1);
    expect(count(html, '<h1')).toBe(1);
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    expect(main).toContain('<h1');
    expect(html).not.toContain('<aside');
  });
});

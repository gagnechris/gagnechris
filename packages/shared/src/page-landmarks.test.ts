import { describe, expect, it } from 'vitest';
import { SAMPLE_PROJECTS } from './fixtures/sample-projects.js';
import { DEFAULT_HOME } from './home-default.js';
import { renderHomeBodyHtml } from './home-html.js';
import { renderPostArticleHtml, renderPostPageBodyHtml } from './post-html.js';
import {
  projectPageView,
  renderProjectPageBodyHtml,
  renderProjectsIndexBodyHtml,
} from './project-html.js';
import { DEFAULT_RESUME } from './resume-default.js';
import {
  renderResumeBodyHtml,
  renderResumeUnavailableBodyHtml,
} from './resume-html.js';

const post = {
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  publishedAt: '2026-02-01T00:00:00.000Z',
  bodyMarkdown: '## Section',
};

const BODIES: [string, string][] = [
  ['home', renderHomeBodyHtml(DEFAULT_HOME)],
  ['post', renderPostPageBodyHtml(post)],
  ['projects index', renderProjectsIndexBodyHtml(SAMPLE_PROJECTS)],
  [
    'project',
    renderProjectPageBodyHtml(projectPageView(SAMPLE_PROJECTS[0]!, [])),
  ],
  ['resume', renderResumeBodyHtml(DEFAULT_RESUME)],
  ['resume unavailable', renderResumeUnavailableBodyHtml()],
];

describe('every page body is one <main> that holds its <h1>', () => {
  it.each(BODIES)('%s', (_page, html) => {
    const count = (tag: string) => html.split(tag).length - 1;
    expect(html).toMatch(/^<main[ >]/);
    expect(html).toMatch(/<\/main>$/);
    expect(count('<main')).toBe(1);
    expect(count('<h1')).toBe(1);
    expect(html).not.toContain('<aside');
  });
});

describe('renderPostArticleHtml', () => {
  it('takes the title level for embeds and has no author note', () => {
    const html = renderPostArticleHtml(post, [], 3);
    expect(html).toContain('<h3>Hello</h3>');
    expect(html).not.toMatch(/<h1|post-author|<main/);
  });
});

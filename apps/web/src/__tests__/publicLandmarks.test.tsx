import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  projectPageView,
  renderPostPageBodyHtml,
  renderResumeBodyHtml,
} from '@gagnechris/shared/render';
import {
  renderHomeBodyHtml,
  renderProjectPageBodyHtml,
  renderProjectsIndexBodyHtml,
} from '@gagnechris/public-ui/server';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { routes } from '../routes';

vi.mock('../utils/analytics');

const project = SAMPLE_PROJECTS.find((p) => p.slug === 'notebook')!;
const post = {
  id: '01P',
  slug: 'hello',
  title: 'Hello',
  excerpt: 'Hi.',
  publishedAt: '2026-02-01T00:00:00.000Z',
  bodyMarkdown: 'Body.',
};

const PAGES: Record<string, string> = {
  '/': renderHomeBodyHtml(DEFAULT_HOME),
  '/posts/hello/': renderPostPageBodyHtml(post),
  '/projects/': renderProjectsIndexBodyHtml(SAMPLE_PROJECTS),
  '/projects/notebook/': renderProjectPageBodyHtml(
    projectPageView(project, []),
  ),
  '/resume/': renderResumeBodyHtml(DEFAULT_RESUME),
};

const serve = (url: string) => {
  if (url === '/posts/posts.json') {
    return { ok: true, status: 200, json: async () => ({ items: [post] }) };
  }
  const body = PAGES[url];
  return body === undefined
    ? { ok: false, status: 404, text: async () => '' }
    : {
        ok: true,
        status: 200,
        text: async () => `<!doctype html><html><body>${body}</body></html>`,
      };
};

describe('every public page puts its body, h1 included, in one <main>', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => serve(url)),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test.each([
    '/',
    '/posts',
    '/posts/hello',
    '/projects',
    '/projects/notebook',
    '/resume',
    '/contact',
    '/no-such-page',
    '/dont-feed-the-bears',
    '/dont-feed-the-bears/camp',
    '/dont-feed-the-bears/wild',
  ])('%s', async (path) => {
    const { container } = render(
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: [path] })}
      />,
    );
    const h1 = await screen.findByRole('heading', { level: 1 });
    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    const main = mains[0]!;
    expect(main.contains(h1)).toBe(true);
    expect(main.previousElementSibling).toHaveClass('site-header');
    expect(main.nextElementSibling).toHaveClass('site-footer');
    expect([...main.parentElement!.children].map((el) => el.tagName)).toEqual([
      'HEADER',
      'MAIN',
      'FOOTER',
    ]);
    expect(container.querySelectorAll('aside:not([role])')).toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, render, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  SITE_DEFAULT_DESCRIPTION,
  SITE_OG_IMAGE_PATH,
  siteUrl,
} from '@gagnechris/shared';
import { applyPageMeta } from '@gagnechris/shared/render';
import {
  renderPostPageBodyHtml,
  renderSitePageHtml,
} from '@gagnechris/public-ui/server';
import App from '../App';
import DontFeedTheBears from '../pages/DontFeedTheBears';
import PostPage from '../pages/PostPage';
import PostsIndex from '../pages/PostsIndex';
import Contact from '../pages/Contact';
import NotFound from '../pages/NotFound';
import Resume from '../pages/Resume';
import { BEARS_PAGE_META } from '../games/bears/shared/pageMeta';

vi.mock('../utils/analytics');

const SHELL = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

const headMeta = (selector: string) =>
  document.head.querySelector(`meta[${selector}]`)?.getAttribute('content');

const seedStaticMeta = () => {
  document.head.innerHTML = `
    <title>Chris Gagne - Engineering Leader</title>
    <meta name="description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
    <meta property="og:title" content="Chris Gagne - Engineering Leader" />
    <meta property="og:description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Chris Gagne - Engineering Leader" />
    <meta name="twitter:description" content="Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems." />
  `;
};

const expectSingleMetaSet = () => {
  expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
  expect(document.querySelectorAll('meta[property="og:title"]')).toHaveLength(
    1,
  );
  expect(
    document.querySelectorAll('meta[property="og:description"]'),
  ).toHaveLength(1);
  expect(document.querySelectorAll('meta[name="twitter:card"]')).toHaveLength(
    1,
  );
  expect(document.querySelectorAll('meta[name="twitter:title"]')).toHaveLength(
    1,
  );
  expect(
    document.querySelectorAll('meta[name="twitter:description"]'),
  ).toHaveLength(1);
};

describe('meta tags (no duplicates with static defaults)', () => {
  beforeEach(() => {
    seedStaticMeta();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('home page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expectSingleMetaSet();
  });

  test('resume page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <Resume />
      </MemoryRouter>,
    );
    expectSingleMetaSet();
  });

  test('contact page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <Contact />
      </MemoryRouter>,
    );
    expectSingleMetaSet();
  });

  test('blog post page keeps a single meta set', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<!DOCTYPE html><html><body>
          <article class="blog-post-prerender">
            <header><h1>Welcome</h1><time datetime="2026-02-01">2026-02-01</time></header>
            <div class="blog-post-body"><p>Hi</p></div>
          </article>
        </body></html>`,
      }),
    );

    render(
      <MemoryRouter initialEntries={['/posts/welcome']}>
        <Routes>
          <Route path="/posts/:slug" element={<PostPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.title).toBe('Welcome - Chris Gagne');
    });
    expectSingleMetaSet();
  });

  test('404 page keeps a single meta set', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expectSingleMetaSet();
  });
});

test('the shell head carries the site defaults pages fall back to', () => {
  const head = new DOMParser().parseFromString(SHELL, 'text/html').head;
  for (const selector of [
    'name="description"',
    'property="og:description"',
    'name="twitter:description"',
  ]) {
    expect(
      head.querySelector(`meta[${selector}]`)?.getAttribute('content'),
    ).toBe(SITE_DEFAULT_DESCRIPTION);
  }
  for (const selector of ['property="og:image"', 'name="twitter:image"']) {
    expect(
      head.querySelector(`meta[${selector}]`)?.getAttribute('content'),
    ).toBe(siteUrl(SITE_OG_IMAGE_PATH));
  }
});

describe('client navigation replaces the previous page head', () => {
  const POST_IMAGE = 'https://gagnechris.com/media/welcome.png';
  const POST_DESCRIPTION = 'Why this site exists & how it publishes.';

  beforeEach(() => {
    document.head.innerHTML = new DOMParser().parseFromString(
      SHELL,
      'text/html',
    ).head.innerHTML;
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          applyPageMeta(SHELL, {
            title: 'Welcome - Chris Gagne',
            description: 'Why this site exists &amp; how it publishes.',
            url: 'https://gagnechris.com/posts/welcome',
            type: 'article',
            image: POST_IMAGE,
          }).replace(
            '<div id="root"></div>',
            `<div id="root">${renderSitePageHtml(
              '/posts',
              renderPostPageBodyHtml({
                slug: 'welcome',
                title: 'Welcome',
                excerpt: '',
                publishedAt: '2026-02-01T00:00:00.000Z',
                bodyMarkdown: 'Hi.',
              }),
            )}</div>`,
          ),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
  });

  const startOnBears = () => {
    const router = createMemoryRouter(
      [
        { path: '/dont-feed-the-bears', element: <DontFeedTheBears /> },
        { path: '/posts', element: <PostsIndex /> },
        { path: '/posts/:slug', element: <PostPage /> },
      ],
      { initialEntries: ['/dont-feed-the-bears'] },
    );
    render(<RouterProvider router={router} />);
    expect(headMeta('name="description"')).toBe(
      BEARS_PAGE_META.landing.description,
    );
    expect(headMeta('property="og:image"')).toBe(
      'https://gagnechris.com/og-dont-feed-the-bears.jpg',
    );
    return router;
  };

  test("a post takes the published page's description and image", async () => {
    const router = startOnBears();
    await act(() => router.navigate('/posts/welcome'));

    await waitFor(() => expect(document.title).toBe('Welcome - Chris Gagne'));
    for (const selector of [
      'name="description"',
      'property="og:description"',
      'name="twitter:description"',
    ]) {
      expect(headMeta(selector)).toBe(POST_DESCRIPTION);
    }
    expect(headMeta('property="og:image"')).toBe(POST_IMAGE);
    expect(headMeta('name="twitter:image"')).toBe(POST_IMAGE);
  });

  test('a page with no image of its own falls back to the site image', async () => {
    const router = startOnBears();
    await act(() => router.navigate('/posts'));

    expect(headMeta('name="description"')).toBe('Posts by Chris Gagne.');
    expect(headMeta('property="og:image"')).toBe(
      'https://gagnechris.com/og-image.jpg',
    );
    expect(headMeta('name="twitter:image"')).toBe(
      'https://gagnechris.com/og-image.jpg',
    );
  });
});

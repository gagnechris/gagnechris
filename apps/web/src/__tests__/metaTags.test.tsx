import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../App';
import BlogPost from '../pages/BlogPost';
import Contact from '../pages/Contact';
import NotFound from '../pages/NotFound';
import Resume from '../pages/Resume';

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
      <MemoryRouter initialEntries={['/blog/welcome']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
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

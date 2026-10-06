import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PostPage from './PostPage';

describe('PostPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('loads CMS posts from publisher prerender HTML', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<!DOCTYPE html><html><body>
          <article class="blog-post-prerender" data-slug="cms-post">
            <header>
              <h1>CMS Title</h1>
              <time datetime="2026-02-01">February 1, 2026</time>
            </header>
            <div class="blog-post-body"><p>Hello from CMS.</p></div>
          </article>
        </body></html>`,
      }),
    );

    render(
      <MemoryRouter initialEntries={['/posts/cms-post']}>
        <Routes>
          <Route path="/posts/:slug" element={<PostPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'CMS Title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hello from CMS.')).toBeInTheDocument();
    const time = screen.getByText('February 1, 2026');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-02-01');
    expect(document.title).toBe('CMS Title - Chris Gagne');
    expect(fetch).toHaveBeenCalledWith(
      '/posts/cms-post/',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
  });

  test('formats midnight UTC as February 1 with datetime attribute', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<!DOCTYPE html><html><body>
          <article class="blog-post-prerender" data-slug="welcome">
            <header>
              <h1>Welcome</h1>
              <time datetime="2026-02-01T00:00:00.000Z">2026-02-01</time>
            </header>
            <div class="blog-post-body"><p>Hi.</p></div>
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

    const time = await screen.findByText('February 1, 2026');
    expect(time).toHaveAttribute('datetime', '2026-02-01');
  });

  test('shows NotFound when publisher page is missing', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
      }),
    );

    render(
      <MemoryRouter initialEntries={['/posts/missing']}>
        <Routes>
          <Route path="/posts/:slug" element={<PostPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeInTheDocument();
    });
  });

  test.each([
    ['a 503', () => Promise.resolve({ ok: false, status: 503 })],
    ['a network failure', () => Promise.reject(new TypeError('offline'))],
  ])('%s is an error, not the 404', async (_label, respond) => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(respond));

    render(
      <MemoryRouter initialEntries={['/posts/welcome']}>
        <Routes>
          <Route path="/posts/:slug" element={<PostPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this post',
    );
    expect(
      screen.queryByRole('heading', { name: 'Page not found' }),
    ).not.toBeInTheDocument();
  });
});

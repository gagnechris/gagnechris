import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import BlogPost from './BlogPost';

describe('BlogPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
      <MemoryRouter initialEntries={['/blog/cms-post']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
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
      '/blog/cms-post/',
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
      <MemoryRouter initialEntries={['/blog/welcome']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
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
      <MemoryRouter initialEntries={['/blog/missing']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeInTheDocument();
    });
  });
});

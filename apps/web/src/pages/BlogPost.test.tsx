import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BlogPost from './BlogPost'

describe('BlogPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('sets document title from the post title', async () => {
    render(
      <MemoryRouter initialEntries={['/blog/welcome']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    })

    expect(document.title).toBe('Welcome - Chris Gagne')
  })

  test('loads CMS posts from publisher prerender HTML when not in markdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<!DOCTYPE html><html><body>
          <article class="blog-post-prerender" data-slug="cms-post">
            <header>
              <h1>CMS Title</h1>
              <time datetime="2026-09-27T12:00:00.000Z">2026-09-27</time>
            </header>
            <div class="blog-post-body"><p>Hello from CMS.</p></div>
          </article>
        </body></html>`,
      }),
    )

    render(
      <MemoryRouter initialEntries={['/blog/cms-post']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'CMS Title' })).toBeInTheDocument()
    expect(screen.getByText('Hello from CMS.')).toBeInTheDocument()
    expect(document.title).toBe('CMS Title - Chris Gagne')
    expect(fetch).toHaveBeenCalledWith(
      '/blog/cms-post/',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    )
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BlogIndex from './BlogIndex'

describe('BlogIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  test('lists posts from posts.json', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: '1',
              slug: 'hello',
              title: 'Hello World',
              excerpt: 'An excerpt',
              publishedAt: '2026-02-01T00:00:00.000Z',
              updatedAt: '2026-02-01T00:00:00.000Z',
              tags: [],
              coverImage: null,
            },
          ],
        }),
      }),
    )

    render(
      <MemoryRouter>
        <BlogIndex />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /Hello World/ })).toHaveAttribute(
      'href',
      '/blog/hello',
    )
    expect(screen.getByText('An excerpt')).toBeInTheDocument()
    const time = screen.getByText('February 1, 2026')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('datetime', '2026-02-01')
    expect(fetch).toHaveBeenCalledWith(
      '/blog/posts.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  test('shows empty state when posts.json has no items', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    )

    render(
      <MemoryRouter>
        <BlogIndex />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/No blog posts yet/i)).toBeInTheDocument()
    })
  })
})

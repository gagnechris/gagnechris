import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import {
  renderPostsIndexBodyHtml,
  type PostsIndexItem,
} from '@gagnechris/shared/render';
import PostsIndexBody from './PostsIndexBody';
import { postsIndexFromDocument } from './publishedPosts';

const item = (
  slug: string,
  publishedAt: string | null,
  excerpt = `About ${slug}.`,
): PostsIndexItem => ({
  id: `id-${slug}`,
  slug,
  title: `${slug} & "co"`,
  excerpt,
  publishedAt,
});

const LISTS: Record<string, PostsIndexItem[]> = {
  'several years, out of order': [
    item('b', '2025-03-01T00:00:00.000Z'),
    item('d', '2026-09-28T09:00:00.000Z'),
    item('a', '2024-12-31T23:59:00.000Z', ''),
    item('c', '2026-02-01T00:00:00.000Z'),
  ],
  'an undated post': [item('x', null), item('y', '2026-01-01T00:00:00.000Z')],
  'no posts': [],
};

const normalize = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML;
};

const parsed = (html: string): PostsIndexItem[] =>
  postsIndexFromDocument(new DOMParser().parseFromString(html, 'text/html'))!;

describe('PostsIndexBody', () => {
  test.each(Object.entries(LISTS))(
    'renders the prerender markup for %s',
    (_name, posts) => {
      const prerender = renderPostsIndexBodyHtml(posts);
      const fromDocument = parsed(prerender);

      for (const list of [posts, fromDocument]) {
        expect(
          normalize(
            renderToStaticMarkup(
              <MemoryRouter>
                <PostsIndexBody posts={list} />
              </MemoryRouter>,
            ),
          ),
        ).toBe(normalize(prerender));
      }
      const { container } = render(
        <MemoryRouter>
          <PostsIndexBody posts={fromDocument} />
        </MemoryRouter>,
      );
      expect(container.innerHTML).toBe(normalize(prerender));
    },
  );

  test('years newest first, posts newest first, each entry one link', () => {
    render(
      <MemoryRouter>
        <PostsIndexBody posts={LISTS['several years, out of order']} />
      </MemoryRouter>,
    );
    const years = screen.getAllByRole('heading', { level: 2 });
    expect(years.map((h) => h.textContent)).toEqual(['2026', '2025', '2024']);

    const section2026 = screen.getByRole('region', { name: '2026' });
    const links = within(section2026).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/posts/d',
      '/posts/c',
    ]);
    for (const entry of within(section2026).getAllByRole('listitem')) {
      expect(within(entry).getAllByRole('link')).toHaveLength(1);
      const link = within(entry).getByRole('link');
      expect(link).toContainElement(within(entry).getByRole('heading'));
      expect(link).toContainElement(entry.querySelector('time'));
    }
    expect(screen.getByText('Sep 28')).toHaveAttribute(
      'datetime',
      '2026-09-28',
    );
  });

  test('links Subscribe via RSS to /rss.xml', () => {
    render(
      <MemoryRouter>
        <PostsIndexBody posts={[]} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: 'Subscribe via RSS' }),
    ).toHaveAttribute('href', '/rss.xml');
  });
});

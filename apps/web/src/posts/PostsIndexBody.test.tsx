import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { postsIndexView, type PostsIndexItem } from '@gagnechris/shared';
import { PostsIndexBody, PublicLinkContext } from '@gagnechris/public-ui';
import { renderPostsIndexBodyHtml } from '@gagnechris/public-ui/server';
import SiteLink from '../components/SiteLink';
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
  'two on one day, ids against time order': [
    { ...item('later', '2026-09-28T10:00:00.000Z'), id: '09' },
    { ...item('earlier', '2026-09-28T09:00:00.000Z'), id: '01' },
  ],
  'quotes and apostrophes': [
    { ...item('q', '2026-01-01T00:00:00.000Z'), title: `Don't "panic"` },
  ],
  'no posts': [],
};

const normalize = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML;
};

const parsed = (html: string) =>
  postsIndexFromDocument(new DOMParser().parseFromString(html, 'text/html'));

const InApp = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <PublicLinkContext.Provider value={SiteLink}>
      {children}
    </PublicLinkContext.Provider>
  </MemoryRouter>
);

describe('PostsIndexBody in the public app', () => {
  test.each(Object.entries(LISTS))(
    'reads back the view the publisher rendered, and prints its markup, for %s',
    (_name, posts) => {
      const prerender = renderPostsIndexBodyHtml(posts);
      const view = parsed(prerender);
      expect(view).toEqual(postsIndexView(posts));

      const { container } = render(
        <InApp>
          <PostsIndexBody years={view!} />
        </InApp>,
      );
      expect(container.innerHTML).toBe(normalize(prerender));
    },
  );

  test('years newest first, posts newest first, each entry one link', () => {
    render(
      <InApp>
        <PostsIndexBody
          years={postsIndexView(LISTS['several years, out of order']!)}
        />
      </InApp>,
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
      <InApp>
        <PostsIndexBody years={[]} />
      </InApp>,
    );
    expect(
      screen.getByRole('link', { name: 'Subscribe via RSS' }),
    ).toHaveAttribute('href', '/rss.xml');
  });
});

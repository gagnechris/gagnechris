import { postsIndexView, type PostsIndexYear } from '@gagnechris/shared';
import { fromPrerender } from '../prerender/documentPrerender';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';

/** CloudFront serves `/posts/*` from the `blog/` S3 prefix. */
export type PublishedPostListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  coverImage: string | null;
};

type PostsJson = {
  items?: PublishedPostListItem[];
};

export const publishedPostsUrl = (): string =>
  publishedSiteUrl('/posts/posts.json');

export const publishedPostPageUrl = (slug: string): string =>
  publishedSiteUrl(`/posts/${slug}/`);

export async function fetchPublishedPosts(): Promise<PublishedPostListItem[]> {
  const response = await fetch(publishedPostsUrl(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load posts.json (${response.status})`);
  }
  const data = (await response.json()) as PostsJson;
  const items = Array.isArray(data.items) ? data.items : [];
  return items.filter(
    (item) => typeof item?.slug === 'string' && item.slug.trim() !== '',
  );
}

/** Lossless: the view this returns is the one the page was rendered from. */
export function postsIndexFromDocument(
  root: ParentNode,
): PostsIndexYear[] | null {
  const index = root.querySelector('main.posts-index');
  if (!index) return null;

  return [...index.querySelectorAll('.posts-year')].map((section) => ({
    year: section.querySelector('.posts-year__label')?.textContent ?? '',
    posts: [...section.querySelectorAll('.post-preview')].flatMap((entry) => {
      const href = entry.querySelector('a')?.getAttribute('href') ?? '';
      const slug = href.replace(/^\/posts\//, '');
      if (!slug || slug === href) return [];
      const text = (selector: string) =>
        entry.querySelector(selector)?.textContent ?? '';
      return [
        {
          id: entry.getAttribute('data-id') || slug,
          slug,
          title: text('.post-preview__title'),
          excerpt: text('.post-preview__excerpt'),
          date: text('time'),
          dateTime: entry.querySelector('time')?.getAttribute('datetime') ?? '',
        },
      ];
    }),
  }));
}

export const documentPostsIndex = (): PostsIndexYear[] | null =>
  fromPrerender(postsIndexFromDocument);

export const loadPostsIndex = async (): Promise<PostsIndexYear[]> =>
  postsIndexView(await fetchPublishedPosts());

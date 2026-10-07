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

export function postsIndexFromDocument(
  root: ParentNode,
): PublishedPostListItem[] | null {
  const main = root.querySelector('.blog-index-prerender > main');
  if (!main) return null;

  return [...main.querySelectorAll('.post-preview')].flatMap((entry) => {
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
        publishedAt:
          entry.querySelector('time')?.getAttribute('datetime') || null,
        updatedAt: '',
        tags: [],
        coverImage: null,
      },
    ];
  });
}

export const documentPostsIndex = (): PublishedPostListItem[] | null =>
  fromPrerender(postsIndexFromDocument);

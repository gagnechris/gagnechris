import { fromPrerender } from '../prerender/documentPrerender';

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

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedPostsUrl(): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim();
  return localSite ? '/__site/posts/posts.json' : '/posts/posts.json';
}

export function publishedPostPageUrl(slug: string): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim();
  const path = `/posts/${slug}/`;
  return localSite ? `/__site${path}` : path;
}

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

/** Also reads the card list published before the year groups, until it is republished. */
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
        title: text('.post-preview__title, h2'),
        excerpt: text('.post-preview__excerpt, .post-excerpt'),
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

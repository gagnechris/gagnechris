/**
 * Client loader for publisher-generated `/writing/posts.json` (Option B).
 * CloudFront serves `/writing/*` from the `blog/` S3 prefix (CHR-206).
 */

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
  return localSite ? '/__site/writing/posts.json' : '/writing/posts.json';
}

export function publishedPostPageUrl(slug: string): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim();
  const path = `/writing/${slug}/`;
  return localSite ? `/__site${path}` : path;
}

/** Published posts only; empty slug excluded (CHR-71). */
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

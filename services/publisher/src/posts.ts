import { comparePostsNewestFirst, type Post } from '@gagnechris/shared';
import type { SiteStorage } from './storage.js';

export const POSTS_JSON_KEY = 'blog/posts.json';

export type PublishedListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  updatedAt: string;
  tags: string[];
  coverImage: string | null;
};

export function toListItem(post: Post): PublishedListItem {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    tags: post.tags,
    coverImage: post.coverImage,
  };
}

export function sortPostsNewestFirst<T extends Post>(posts: T[]): T[] {
  return posts.sort(comparePostsNewestFirst);
}

export async function readPublishedListItems(
  storage: SiteStorage,
): Promise<PublishedListItem[]> {
  const raw = await storage.read(POSTS_JSON_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items.filter(
      (item): item is PublishedListItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PublishedListItem).id === 'string' &&
        typeof (item as PublishedListItem).slug === 'string' &&
        (item as PublishedListItem).slug !== '' &&
        typeof (item as PublishedListItem).title === 'string' &&
        typeof (item as PublishedListItem).updatedAt === 'string',
    );
  } catch {
    return [];
  }
}

/** Feeds read only the list fields; the body is never rendered from this. */
export function listItemToFeedPost(item: PublishedListItem): Post {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    bodyMarkdown: '',
    tags: Array.isArray(item.tags) ? item.tags : [],
    projectIds: [],
    status: 'published',
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    coverImage: item.coverImage ?? null,
    seo: null,
    version: 0,
    hasUnpublishedChanges: false,
  };
}

import type { Post } from '@gagnechris/shared';

export type PostMetaRecord = {
  pk?: string;
  sk?: string;
  entityType?: string;
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags?: string[];
  status: Post['status'];
  publishedAt?: string | null;
  updatedAt: string;
  coverImage?: string | null;
  seo?: Post['seo'];
  version?: number;
};

export function metaToPost(item: PostMetaRecord): Post {
  return {
    id: item.postId,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    bodyMarkdown: item.bodyMarkdown,
    tags: item.tags ?? [],
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    coverImage: item.coverImage ?? null,
    seo: item.seo ?? null,
    version: item.version ?? 0,
  };
}

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

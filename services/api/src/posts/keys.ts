import type { Post, PostStatus } from '@gagnechris/shared';
import { slugify as sharedSlugify } from '@gagnechris/shared';

/** Post entity keys only — never NOTE# / TASK# (reserved for Notebook). */
export function postPk(postId: string): string {
  return `POST#${postId}`;
}

export function postMetaSk(): string {
  return 'META';
}

export function postPublishedSk(): string {
  return 'PUBLISHED';
}

export function slugPk(slug: string): string {
  return `SLUG#${slug}`;
}

export function slugPostSk(): string {
  return 'POST';
}

export function slugRedirectSk(): string {
  return 'REDIRECT';
}

export function tagPk(tag: string): string {
  return `TAG#${tag}`;
}

export function tagSk(publishedAt: string, postId: string): string {
  return `TS#${publishedAt}#POST#${postId}`;
}

export function statusGsi1Pk(status: PostStatus): string {
  return `STATUS#${status}`;
}

export function statusGsi1Sk(sortTs: string, postId: string): string {
  return `TS#${sortTs}#POST#${postId}`;
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Shared slugify with API fallback when the title yields an empty slug. */
export function slugify(input: string): string {
  return sharedSlugify(input) || 'post';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export type PostMetaItem = {
  pk: string;
  sk: string;
  entityType: 'post';
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  tags: string[];
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
  coverImage: string | null;
  seo: Post['seo'];
  version: number;
  gsi1pk: string;
  gsi1sk: string;
};

export function postContentEqual(
  a: Pick<
    Post,
    'slug' | 'title' | 'excerpt' | 'bodyMarkdown' | 'tags' | 'coverImage' | 'seo'
  >,
  b: Pick<
    Post,
    'slug' | 'title' | 'excerpt' | 'bodyMarkdown' | 'tags' | 'coverImage' | 'seo'
  >,
): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.bodyMarkdown === b.bodyMarkdown &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    a.coverImage === b.coverImage &&
    JSON.stringify(a.seo ?? null) === JSON.stringify(b.seo ?? null)
  );
}

export function metaToPost(
  item: PostMetaItem,
  hasUnpublishedChanges = false,
): Post {
  return {
    id: item.postId,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    bodyMarkdown: item.bodyMarkdown,
    tags: item.tags,
    status: item.status,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    coverImage: item.coverImage,
    seo: item.seo,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildMetaItem(post: Post): PostMetaItem {
  const sortTs =
    post.status === 'published' && post.publishedAt
      ? post.publishedAt
      : post.updatedAt;
  return {
    pk: postPk(post.id),
    sk: postMetaSk(),
    entityType: 'post',
    postId: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    tags: post.tags,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    coverImage: post.coverImage,
    seo: post.seo,
    version: post.version,
    gsi1pk: statusGsi1Pk(post.status),
    gsi1sk: statusGsi1Sk(sortTs, post.id),
  };
}

/**
 * Live snapshot read by the publisher. Omits GSI1 keys so admin
 * `STATUS#published` queries only return draft META rows.
 */
export function buildPublishedItem(
  post: Post,
): Omit<PostMetaItem, 'gsi1pk' | 'gsi1sk'> {
  const publishedAt = post.publishedAt ?? post.updatedAt;
  const meta = buildMetaItem({ ...post, status: 'published', publishedAt });
  const { gsi1pk: _gsi1pk, gsi1sk: _gsi1sk, ...rest } = meta;
  return {
    ...rest,
    sk: postPublishedSk(),
    status: 'published',
    publishedAt,
  };
}

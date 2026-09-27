import type { Post, PostStatus } from '@gagnechris/shared';

/** Post entity keys only — never NOTE# / TASK# (reserved for Notebook). */
export function postPk(postId: string): string {
  return `POST#${postId}`;
}

export function postMetaSk(): string {
  return 'META';
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

export function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'post';
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

export function metaToPost(item: PostMetaItem): Post {
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

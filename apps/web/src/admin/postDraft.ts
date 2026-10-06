import { EMPTY_SLUG_FALLBACK } from '@gagnechris/shared';
import { mergeEditorSeo, type UpdatePostRequest } from '@gagnechris/app-core';
import type { components } from '@gagnechris/api-client';

type Post = components['schemas']['Post'];

export type PostDraftFields = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  tagsText: string;
  projectIds: string[];
  coverImage: string;
  seoTitle: string;
  seoDescription: string;
};

export const emptyPostDraft = (): PostDraftFields => ({
  title: 'Untitled',
  slug: '',
  excerpt: '',
  bodyMarkdown: '',
  tagsText: '',
  projectIds: [],
  coverImage: '',
  seoTitle: '',
  seoDescription: '',
});

export const postDraftFromPost = (post: Post): PostDraftFields => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  bodyMarkdown: post.bodyMarkdown,
  tagsText: post.tags.join(', '),
  projectIds: post.projectIds,
  coverImage: post.coverImage ?? '',
  seoTitle: post.seo?.title ?? '',
  seoDescription: post.seo?.description ?? '',
});

export const parsePostTags = (text: string): string[] =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export const postPayload = (
  draft: PostDraftFields,
  saved: Post,
): Omit<UpdatePostRequest, 'version'> => ({
  title: draft.title.trim() || 'Untitled',
  slug: draft.slug.trim() || EMPTY_SLUG_FALLBACK,
  excerpt: draft.excerpt,
  bodyMarkdown: draft.bodyMarkdown,
  tags: parsePostTags(draft.tagsText),
  projectIds: draft.projectIds,
  coverImage: draft.coverImage.trim() || null,
  seo: mergeEditorSeo(saved.seo, draft),
});

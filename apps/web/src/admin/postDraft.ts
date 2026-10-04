import type { components } from '@gagnechris/api-client';
import type { PostDraftFields } from './PostEditorSections';

type Post = components['schemas']['Post'];

export const emptyPostDraft = (): PostDraftFields => ({
  title: 'Untitled',
  slug: '',
  excerpt: '',
  bodyMarkdown: '',
  tagsText: '',
  projectIds: [],
  coverImage: '',
});

export const postDraftFromPost = (post: Post): PostDraftFields => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  bodyMarkdown: post.bodyMarkdown,
  tagsText: post.tags.join(', '),
  projectIds: post.projectIds,
  coverImage: post.coverImage ?? '',
});

export const parsePostTags = (text: string): string[] =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

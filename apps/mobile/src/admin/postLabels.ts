import type { PostSummary } from '@gagnechris/app-core';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const postStatusLabel = (post: {
  status: PostSummary['status'];
  hasUnpublishedChanges: boolean;
}): string =>
  post.status === 'published'
    ? post.hasUnpublishedChanges
      ? 'Published · unpublished changes'
      : 'Published'
    : 'Draft';

/** Published posts show when they went live; drafts, when they were last edited. */
export const postMeta = (post: PostSummary): string =>
  [
    postStatusLabel(post),
    post.status === 'published' && post.publishedAt
      ? shortDate(post.publishedAt)
      : `Edited ${shortDate(post.updatedAt)}`,
  ].join(' · ');

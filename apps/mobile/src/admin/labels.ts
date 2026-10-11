import type { PostSummary, Project } from '@gagnechris/app-core';
import { PROJECT_STAGE_LABELS, projectCardHref } from '@gagnechris/shared';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const publishStatusLabel = (entity: {
  status: PostSummary['status'];
  hasUnpublishedChanges: boolean;
}): string =>
  entity.status === 'published'
    ? entity.hasUnpublishedChanges
      ? 'Published · unpublished changes'
      : 'Published'
    : 'Draft';

/** Published posts show when they went live; drafts, when they were last edited. */
export const postMeta = (post: PostSummary): string =>
  [
    publishStatusLabel(post),
    post.status === 'published' && post.publishedAt
      ? shortDate(post.publishedAt)
      : `Edited ${shortDate(post.updatedAt)}`,
  ].join(' · ');

/** Stage, status, where the card links and the list order. */
export const projectMeta = (project: Project): string =>
  [
    PROJECT_STAGE_LABELS[project.stage],
    publishStatusLabel(project),
    project.href
      ? `→ ${project.href}`
      : (projectCardHref(project) ?? 'no page'),
    `Order ${project.order}`,
  ].join(' · ');

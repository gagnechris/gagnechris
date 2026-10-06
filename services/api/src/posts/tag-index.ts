import type { Post } from '@gagnechris/shared';
import { tagPk, tagSk } from '@gagnechris/data';
import type { PersistPublishOptions } from '../data/publishable-repository.js';
import type { TransactItem } from '../data/slug-claims.js';

/**
 * Tag index rows mirror the PUBLISHED post, so they change only when it is
 * written or deleted, never on a draft edit.
 */
export function buildTagSyncItems(
  tableName: string,
  after: Post,
  options: PersistPublishOptions<Post>,
): TransactItem[] {
  const writePublished = Boolean(options.syncPublished);
  if (!writePublished && !options.deletePublished) return [];

  const items: TransactItem[] = [];
  const previous = options.previousPublished;
  const beforeTags = previous?.tags ?? [];
  const beforePublishedAt = previous?.publishedAt ?? null;
  const afterTags =
    writePublished && after.status === 'published'
      ? after.tags
      : ([] as string[]);
  const afterPublishedAt =
    writePublished && after.status === 'published' ? after.publishedAt : null;

  for (const tag of beforeTags) {
    if (!beforePublishedAt) continue;
    const still =
      afterTags.includes(tag) &&
      afterPublishedAt === beforePublishedAt &&
      writePublished;
    if (still) continue;
    items.push({
      Delete: {
        TableName: tableName,
        Key: {
          pk: tagPk(tag),
          sk: tagSk(beforePublishedAt, after.id),
        },
      },
    });
  }
  for (const tag of afterTags) {
    if (!afterPublishedAt) continue;
    const already =
      beforeTags.includes(tag) && beforePublishedAt === afterPublishedAt;
    if (already) continue;
    items.push({
      Put: {
        TableName: tableName,
        Item: {
          pk: tagPk(tag),
          sk: tagSk(afterPublishedAt, after.id),
          gsi2pk: tagPk(tag),
          gsi2sk: tagSk(afterPublishedAt, after.id),
          entityType: 'tagIndex',
          postId: after.id,
          slug: after.slug,
        },
      },
    });
  }
  return items;
}

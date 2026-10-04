// Keeps slug/tag side-effects out of the generic Publishable layer.
import type { Post } from '@gagnechris/shared';
import {
  VERSION_MATCH_CONDITION,
  versionMatchValues,
} from '../data/version-condition.js';
import {
  buildMetaItem,
  buildPublishedItem,
  postPk,
  postPublishedSk,
  tagPk,
  tagSk,
} from '@gagnechris/data';
import {
  buildSlugChangeItems,
  buildSoftDeleteSlugRelease,
  type TransactItem,
} from '../data/slug-claims.js';

export { buildSlugChangeItems, buildSoftDeleteSlugRelease };

export type { TransactItem };

export type DraftMutationOptions = {
  syncTags?: boolean;
  writePublished?: boolean;
  deletePublished?: boolean;
  previousPublished?: Post;
};

export function buildMetaPut(
  tableName: string,
  before: Post,
  after: Post,
): TransactItem {
  return {
    Put: {
      TableName: tableName,
      Item: buildMetaItem(after),
      ConditionExpression: VERSION_MATCH_CONDITION,
      ExpressionAttributeValues: versionMatchValues(before.version),
    },
  };
}

export function buildPublishedPut(
  tableName: string,
  after: Post,
): TransactItem {
  return {
    Put: {
      TableName: tableName,
      Item: buildPublishedItem(after),
    },
  };
}

export function buildPublishedDelete(
  tableName: string,
  after: Post,
): TransactItem {
  return {
    Delete: {
      TableName: tableName,
      Key: { pk: postPk(after.id), sk: postPublishedSk() },
    },
  };
}

export function buildTagSyncItems(
  tableName: string,
  after: Post,
  options: DraftMutationOptions,
): TransactItem[] {
  if (!options.syncTags) return [];

  const items: TransactItem[] = [];
  const previous = options.previousPublished;
  const beforeTags = previous?.tags ?? [];
  const beforePublishedAt = previous?.publishedAt ?? null;
  const afterTags =
    options.writePublished && after.status === 'published'
      ? after.tags
      : ([] as string[]);
  const afterPublishedAt =
    options.writePublished && after.status === 'published'
      ? after.publishedAt
      : null;

  for (const tag of beforeTags) {
    if (!beforePublishedAt) continue;
    const still =
      afterTags.includes(tag) &&
      afterPublishedAt === beforePublishedAt &&
      Boolean(options.writePublished);
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

export type DraftMutationPlan = {
  items: TransactItem[];
  /** TransactWrite indexes of slug-claim Puts (attribute_not_exists). */
  slugClaimIndexes: number[];
};

export function buildDraftMutationItems(
  tableName: string,
  before: Post,
  after: Post,
  options: DraftMutationOptions = {},
): DraftMutationPlan {
  const items: TransactItem[] = [buildMetaPut(tableName, before, after)];
  const slugItems = buildSlugChangeItems(tableName, before, after);
  const slugClaimIndexes: number[] = [];
  for (const item of slugItems) {
    if (item.Put?.ConditionExpression?.includes('attribute_not_exists(pk)')) {
      slugClaimIndexes.push(items.length);
    }
    items.push(item);
  }
  if (options.writePublished) {
    items.push(buildPublishedPut(tableName, after));
  }
  if (options.deletePublished) {
    items.push(buildPublishedDelete(tableName, after));
  }
  items.push(...buildTagSyncItems(tableName, after, options));
  items.push(...buildSoftDeleteSlugRelease(tableName, before, after));
  return { items, slugClaimIndexes };
}

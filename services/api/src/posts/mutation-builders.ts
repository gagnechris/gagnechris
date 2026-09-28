/**
 * Transaction item builders for post draft mutations (CHR-129).
 * Keep slug/tag side-effects out of the generic Publishable layer.
 */
import type { Post } from '@gagnechris/shared';
import {
  buildMetaItem,
  buildPublishedItem,
  postPk,
  postPublishedSk,
  slugPk,
  slugPostSk,
  slugRedirectSk,
  tagPk,
  tagSk,
} from './keys.js';

export type TransactItem = {
  Put?: {
    TableName: string;
    Item: Record<string, unknown>;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
  Delete?: {
    TableName: string;
    Key: Record<string, string>;
    ConditionExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
};

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
      ConditionExpression: 'attribute_not_exists(version) OR version = :v',
      ExpressionAttributeValues: { ':v': before.version },
    },
  };
}

export function buildSlugChangeItems(
  tableName: string,
  before: Post,
  after: Post,
): TransactItem[] {
  if (before.slug === after.slug) return [];
  return [
    {
      Delete: {
        TableName: tableName,
        Key: { pk: slugPk(before.slug), sk: slugPostSk() },
        ConditionExpression: 'postId = :id',
        ExpressionAttributeValues: { ':id': before.id },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          pk: slugPk(before.slug),
          sk: slugRedirectSk(),
          entityType: 'slugRedirect',
          postId: before.id,
          targetSlug: after.slug,
        },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          pk: slugPk(after.slug),
          sk: slugPostSk(),
          entityType: 'slug',
          postId: after.id,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
  ];
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

export function buildSoftDeleteSlugRelease(
  tableName: string,
  before: Post,
  after: Post,
): TransactItem[] {
  if (after.status !== 'deleted' || before.status === 'deleted') return [];
  return [
    {
      Delete: {
        TableName: tableName,
        Key: { pk: slugPk(after.slug), sk: slugPostSk() },
      },
    },
  ];
}

/** Assemble the full TransactWrite item list for a draft mutation. */
export function buildDraftMutationItems(
  tableName: string,
  before: Post,
  after: Post,
  options: DraftMutationOptions = {},
): TransactItem[] {
  const items: TransactItem[] = [buildMetaPut(tableName, before, after)];
  items.push(...buildSlugChangeItems(tableName, before, after));
  if (options.writePublished) {
    items.push(buildPublishedPut(tableName, after));
  }
  if (options.deletePublished) {
    items.push(buildPublishedDelete(tableName, after));
  }
  items.push(...buildTagSyncItems(tableName, after, options));
  items.push(...buildSoftDeleteSlugRelease(tableName, before, after));
  return items;
}

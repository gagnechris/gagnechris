import { keys, slugPk, slugPostSk, slugRedirectSk } from '@gagnechris/data';

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

type Key = { pk: string; sk: string };

/** Where an entity type keeps its slug claim and rename redirect rows. */
export type SlugClaims = {
  claimKey: (slug: string) => Key;
  redirectKey: (slug: string) => Key;
  /** Attribute on both rows that names the owning entity id. */
  ownerAttr: string;
  claimEntityType: string;
  redirectEntityType: string;
};

export const POST_SLUG_CLAIMS: SlugClaims = {
  claimKey: (slug) => ({ pk: slugPk(slug), sk: slugPostSk() }),
  redirectKey: (slug) => ({ pk: slugPk(slug), sk: slugRedirectSk() }),
  ownerAttr: 'postId',
  claimEntityType: 'slug',
  redirectEntityType: 'slugRedirect',
};

export const PROJECT_SLUG_CLAIMS: SlugClaims = {
  claimKey: keys.project.slugClaim,
  redirectKey: keys.project.slugRedirect,
  ownerAttr: 'projectId',
  claimEntityType: 'projectSlug',
  redirectEntityType: 'projectSlugRedirect',
};

type Slugged = { id: string; slug: string; status: string };

export function buildSlugClaimPut(
  tableName: string,
  claims: SlugClaims,
  slug: string,
  id: string,
): TransactItem {
  return {
    Put: {
      TableName: tableName,
      Item: {
        ...claims.claimKey(slug),
        entityType: claims.claimEntityType,
        [claims.ownerAttr]: id,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    },
  };
}

export function buildSlugChangeItems(
  tableName: string,
  before: Slugged,
  after: Slugged,
  claims: SlugClaims = POST_SLUG_CLAIMS,
): TransactItem[] {
  if (before.slug === after.slug) return [];
  return [
    {
      Delete: {
        TableName: tableName,
        Key: claims.claimKey(before.slug),
        ConditionExpression: `${claims.ownerAttr} = :id`,
        ExpressionAttributeValues: { ':id': before.id },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          ...claims.redirectKey(before.slug),
          entityType: claims.redirectEntityType,
          [claims.ownerAttr]: before.id,
          targetSlug: after.slug,
        },
      },
    },
    buildSlugClaimPut(tableName, claims, after.slug, after.id),
  ];
}

export function buildSoftDeleteSlugRelease(
  tableName: string,
  before: Slugged,
  after: Slugged,
  claims: SlugClaims = POST_SLUG_CLAIMS,
): TransactItem[] {
  if (after.status !== 'deleted' || before.status === 'deleted') return [];
  return [
    {
      Delete: {
        TableName: tableName,
        Key: claims.claimKey(after.slug),
      },
    },
  ];
}

/** TransactWrite indexes of the slug-claim Puts (`attribute_not_exists`). */
export function slugClaimIndexesOf(items: readonly TransactItem[]): number[] {
  const indexes: number[] = [];
  items.forEach((item, i) => {
    if (item.Put?.ConditionExpression === 'attribute_not_exists(pk)') {
      indexes.push(i);
    }
  });
  return indexes;
}

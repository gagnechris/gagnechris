import { SK_META } from './keys.js';

/**
 * One row updated in the same transaction as every `PUBLISHED` write or
 * delete. Its sk is not `PUBLISHED`, so it never reaches the publisher stream.
 * `generation` changes on every publish-side commit; the id sets name the
 * posts and projects that have a `PUBLISHED` row, readable with
 * `ConsistentRead` where GSI1 is only eventually consistent.
 */
export const SITE_PUBLISH_ENTITY_TYPE = 'sitePublish';

export function sitePublishPk(): string {
  return 'SITE#publish';
}

export function sitePublishSk(): string {
  return SK_META;
}

export const sitePublishKey = () => ({
  pk: sitePublishPk(),
  sk: sitePublishSk(),
});

export type SitePublishIdSet = 'postIds' | 'projectIds';

export type SitePublishState = {
  generation: number;
  postIds: string[];
  projectIds: string[];
};

export type SitePublishChange = {
  /** Omitted for singletons (home, resume): only the generation moves. */
  idSet?: SitePublishIdSet;
  id: string;
  published: boolean;
};

export function buildSitePublishUpdate(
  tableName: string,
  change: SitePublishChange,
) {
  const base = {
    TableName: tableName,
    Key: sitePublishKey(),
    ExpressionAttributeNames: { '#t': 'entityType', '#g': 'generation' },
    ExpressionAttributeValues: {
      ':t': SITE_PUBLISH_ENTITY_TYPE,
      ':one': 1,
    } as Record<string, unknown>,
  };
  if (!change.idSet) {
    return {
      Update: { ...base, UpdateExpression: 'SET #t = :t ADD #g :one' },
    };
  }
  return {
    Update: {
      ...base,
      ExpressionAttributeNames: {
        ...base.ExpressionAttributeNames,
        '#ids': change.idSet,
      },
      ExpressionAttributeValues: {
        ...base.ExpressionAttributeValues,
        ':ids': new Set([change.id]),
      },
      UpdateExpression: change.published
        ? 'SET #t = :t ADD #g :one, #ids :ids'
        : 'SET #t = :t ADD #g :one DELETE #ids :ids',
    },
  };
}

const idList = (value: unknown): string[] =>
  value instanceof Set || Array.isArray(value)
    ? [...(value as Iterable<unknown>)]
        .filter((id): id is string => typeof id === 'string' && id !== '')
        .sort()
    : [];

/** A missing row reads as generation 0 with no ids. */
export function parseSitePublishItem(
  item: Record<string, unknown> | undefined,
): SitePublishState {
  const generation = item?.generation;
  return {
    generation: typeof generation === 'number' ? generation : 0,
    postIds: idList(item?.postIds),
    projectIds: idList(item?.projectIds),
  };
}

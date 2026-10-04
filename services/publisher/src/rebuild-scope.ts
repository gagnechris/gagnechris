import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { SK_PUBLISHED } from '@gagnechris/data';

export type RebuildScope = {
  allPosts: boolean;
  postSlugs: Set<string>;
  slugsToRemove: Set<string>;
  feeds: boolean;
  home: boolean;
  resume: boolean;
  /** Targets with their own Dynamo entity match via this set, so they need no RebuildScope flag. */
  touchedEntityTypes: Set<string>;
};

export type StreamMeta = {
  pk?: string;
  sk?: string;
  entityType?: string;
  slug?: string;
  status?: string;
};

export const PROJECT_ENTITY_TYPE = 'project';

const KNOWN_ENTITY_TYPES = new Set([
  'post',
  'home',
  'resume',
  PROJECT_ENTITY_TYPE,
]);

function isLegacyPostPk(pk: string | undefined): boolean {
  return typeof pk === 'string' && pk.startsWith('POST#');
}

/**
 * Rows without `entityType` count as posts only on a `POST#…` pk; missing
 * entityType on other pks is not treated as a post.
 */
export function isStreamPostEntity(meta: StreamMeta | undefined): boolean {
  if (!meta) return false;
  if (meta.entityType === 'post') return true;
  if (meta.entityType == null && isLegacyPostPk(meta.pk)) return true;
  return false;
}

export function imageToStreamMeta(
  image: Record<string, AttributeValue> | undefined,
): StreamMeta | undefined {
  if (!image) return undefined;
  const item = unmarshall(
    image as Parameters<typeof unmarshall>[0],
  ) as StreamMeta;
  if (item.sk !== SK_PUBLISHED) return undefined;
  return item;
}

export function fullRebuildScope(): RebuildScope {
  return {
    allPosts: true,
    postSlugs: new Set(),
    slugsToRemove: new Set(),
    feeds: true,
    home: true,
    resume: true,
    touchedEntityTypes: new Set(),
  };
}

export function isFullRebuildScope(scope: RebuildScope): boolean {
  return scope.allPosts && scope.home && scope.resume && scope.feeds;
}

export function collectRebuildScope(records: DynamoDBRecord[]): RebuildScope {
  const postSlugs = new Set<string>();
  const slugsToRemove = new Set<string>();
  const touchedEntityTypes = new Set<string>();
  let home = false;
  let resume = false;
  let feeds = false;

  for (const record of records) {
    const oldMeta = imageToStreamMeta(record.dynamodb?.OldImage);
    const newMeta = imageToStreamMeta(record.dynamodb?.NewImage);
    const entity = newMeta?.entityType ?? oldMeta?.entityType ?? undefined;

    if (entity != null) {
      touchedEntityTypes.add(entity);
    }

    // Unknown entity types set no flags but remain in `touchedEntityTypes` so
    // targets can match them.
    if (entity != null && !KNOWN_ENTITY_TYPES.has(entity)) {
      continue;
    }

    if (entity === 'home') {
      if (newMeta?.status === 'published' || oldMeta?.status === 'published') {
        home = true;
      }
      continue;
    }

    // Project targets match on `touchedEntityTypes`; projects set no post flags.
    if (entity === PROJECT_ENTITY_TYPE) continue;

    if (entity === 'resume') {
      if (newMeta?.status === 'published' || oldMeta?.status === 'published') {
        resume = true;
      }
      continue;
    }

    if (!isStreamPostEntity(newMeta) && !isStreamPostEntity(oldMeta)) {
      continue;
    }

    const touchedPublished =
      newMeta?.status === 'published' || oldMeta?.status === 'published';
    if (!touchedPublished) continue;

    feeds = true;

    if (newMeta?.status === 'published' && newMeta.slug) {
      postSlugs.add(newMeta.slug);
    }

    if (
      oldMeta?.status === 'published' &&
      oldMeta.slug &&
      !(newMeta?.status === 'published' && newMeta.slug === oldMeta.slug)
    ) {
      slugsToRemove.add(oldMeta.slug);
    }
  }

  return {
    allPosts: false,
    postSlugs,
    slugsToRemove,
    feeds,
    home,
    resume,
    touchedEntityTypes,
  };
}

function streamPublishedPk(record: DynamoDBRecord): string | undefined {
  for (const image of [
    record.dynamodb?.Keys,
    record.dynamodb?.NewImage,
    record.dynamodb?.OldImage,
  ]) {
    if (!image) continue;
    const item = unmarshall(
      image as Parameters<typeof unmarshall>[0],
    ) as StreamMeta;
    if (item.sk !== SK_PUBLISHED) return undefined;
    if (typeof item.pk === 'string') return item.pk;
  }
  return undefined;
}

/**
 * Merged into a catalog when GSI1 has not caught up. Only the last record per
 * pk counts: a publish then unpublish in the same batch must not add the item
 * back.
 */
function collectStreamPublishedItems(
  records: DynamoDBRecord[],
  isEntity: (item: StreamMeta) => boolean,
): unknown[] {
  const lastByPk = new Map<string, DynamoDBRecord>();
  for (const record of records) {
    const pk = streamPublishedPk(record);
    if (pk) lastByPk.set(pk, record);
  }

  const items: unknown[] = [];
  for (const record of lastByPk.values()) {
    if (record.eventName === 'REMOVE') continue;
    const image = record.dynamodb?.NewImage;
    if (!image) continue;
    const item = unmarshall(
      image as Parameters<typeof unmarshall>[0],
    ) as StreamMeta & Record<string, unknown>;
    if (item.sk !== SK_PUBLISHED) continue;
    if (item.status !== 'published') continue;
    if (!isEntity(item)) continue;
    items.push(item);
  }
  return items;
}

export function collectStreamPublishedPostItems(
  records: DynamoDBRecord[],
): unknown[] {
  return collectStreamPublishedItems(records, isStreamPostEntity);
}

export function collectStreamPublishedProjectItems(
  records: DynamoDBRecord[],
): unknown[] {
  return collectStreamPublishedItems(
    records,
    (item) => item.entityType === PROJECT_ENTITY_TYPE,
  );
}

export function streamNeedsRebuild(
  records: DynamoDBRecord[],
  targets: readonly { matches(scope: RebuildScope): boolean }[],
): boolean {
  const scope = collectRebuildScope(records);
  return targets.some((t) => t.matches(scope));
}

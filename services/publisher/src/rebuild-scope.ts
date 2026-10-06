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
  /**
   * Projects whose pages or links may have changed: tags on both images of a
   * changed published post, and every changed published project.
   */
  projectIds: Set<string>;
  /** Targets with their own Dynamo entity match via this set, so they need no RebuildScope flag. */
  touchedEntityTypes: Set<string>;
};

export type StreamMeta = {
  pk?: string;
  sk?: string;
  entityType?: string;
  slug?: string;
  status?: string;
  projectId?: string;
  projectIds?: unknown;
};

const imageProjectIds = (meta: StreamMeta | undefined): string[] =>
  Array.isArray(meta?.projectIds)
    ? meta.projectIds.filter(
        (id): id is string => typeof id === 'string' && id !== '',
      )
    : [];

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
    projectIds: new Set(),
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
  const projectIds = new Set<string>();
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

    if (entity === PROJECT_ENTITY_TYPE) {
      for (const meta of [oldMeta, newMeta]) {
        if (meta?.projectId) projectIds.add(meta.projectId);
      }
      continue;
    }

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

    // Both images: a project the post was untagged from must drop it too.
    for (const id of [
      ...imageProjectIds(oldMeta),
      ...imageProjectIds(newMeta),
    ]) {
      projectIds.add(id);
    }

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
    projectIds,
    touchedEntityTypes,
  };
}

export function streamNeedsRebuild(
  records: DynamoDBRecord[],
  targets: readonly { matches(scope: RebuildScope): boolean }[],
): boolean {
  const scope = collectRebuildScope(records);
  return targets.some((t) => t.matches(scope));
}

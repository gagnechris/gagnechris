import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { SK_PUBLISHED } from '@gagnechris/data';

/** What a stream batch (or republish-all) needs the publisher to touch. */
export type RebuildScope = {
  /**
   * Re-render every published post HTML. Used by republish-all / local full
   * rebuilds. When false, only `postSlugs` are rendered.
   */
  allPosts: boolean;
  /** Post slugs whose `blog/<slug>/index.html` must be re-rendered. */
  postSlugs: Set<string>;
  /** Candidates for orphan cleanup (unpublish / rename / delete). */
  slugsToRemove: Set<string>;
  /** Update blog index, posts.json, slugs.json, sitemap.xml, rss.xml. */
  feeds: boolean;
  /** Update home prerender (`index.html`). */
  home: boolean;
  /** Update resume HTML + PDF. */
  resume: boolean;
  /**
   * PUBLISHED entity types seen in this stream batch (including types that are
   * not yet scope flags). Targets with their own Dynamo entity match via this
   * set — no new RebuildScope boolean required (CHR-166).
   */
  touchedEntityTypes: Set<string>;
};

export type StreamMeta = {
  pk?: string;
  sk?: string;
  entityType?: string;
  slug?: string;
  status?: string;
};

/** Known PUBLISHED entity types the publisher understands (CHR-128). */
const KNOWN_ENTITY_TYPES = new Set(['post', 'home', 'resume']);

function isLegacyPostPk(pk: string | undefined): boolean {
  return typeof pk === 'string' && pk.startsWith('POST#');
}

/**
 * Whether a PUBLISHED stream image is a post (including legacy rows that omit
 * `entityType` but use a `POST#…` pk). Missing entityType on other pks is not
 * treated as a post (CHR-167).
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

/** Republish-all / local full rebuild — CloudFront invalidation collapses to `/*`. */
export function isFullRebuildScope(scope: RebuildScope): boolean {
  return scope.allPosts && scope.home && scope.resume && scope.feeds;
}

/**
 * Derive a minimal rebuild scope from a DynamoDB Streams batch of PUBLISHED items.
 * Unknown entity types do not set home/resume/feeds flags (CHR-128) but are
 * recorded in `touchedEntityTypes` so registered targets can match them (CHR-166).
 */
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

    // Unknown entity types do not set home/resume/feeds/post flags (CHR-128),
    // but remain in `touchedEntityTypes` so targets can match them (CHR-166).
    if (entity != null && !KNOWN_ENTITY_TYPES.has(entity)) {
      continue;
    }

    if (entity === 'home') {
      if (newMeta?.status === 'published' || oldMeta?.status === 'published') {
        home = true;
      }
      continue;
    }

    if (entity === 'resume') {
      if (newMeta?.status === 'published' || oldMeta?.status === 'published') {
        resume = true;
      }
      continue;
    }

    // Posts only: entityType post, or legacy POST# pk with missing type (CHR-167).
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

/**
 * Unmarshalled PUBLISHED post NewImages from a stream batch. Used to merge
 * just-published posts into the catalog when GSI1 has not caught up (CHR-167).
 */
export function collectStreamPublishedPostItems(
  records: DynamoDBRecord[],
): unknown[] {
  const items: unknown[] = [];
  for (const record of records) {
    const image = record.dynamodb?.NewImage;
    if (!image) continue;
    const item = unmarshall(
      image as Parameters<typeof unmarshall>[0],
    ) as StreamMeta & Record<string, unknown>;
    if (item.sk !== SK_PUBLISHED) continue;
    if (item.status !== 'published') continue;
    if (!isStreamPostEntity(item)) continue;
    items.push(item);
  }
  return items;
}

export function streamNeedsRebuild(records: DynamoDBRecord[]): boolean {
  const scope = collectRebuildScope(records);
  return (
    scope.home ||
    scope.resume ||
    scope.feeds ||
    scope.postSlugs.size > 0 ||
    scope.slugsToRemove.size > 0
  );
}

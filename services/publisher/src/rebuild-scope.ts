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
};

export type StreamMeta = {
  sk?: string;
  entityType?: string;
  slug?: string;
  status?: string;
};

/** Known PUBLISHED entity types the publisher understands (CHR-128). */
const KNOWN_ENTITY_TYPES = new Set(['post', 'home', 'resume']);

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
  };
}

/** Republish-all / local full rebuild — CloudFront invalidation collapses to `/*`. */
export function isFullRebuildScope(scope: RebuildScope): boolean {
  return scope.allPosts && scope.home && scope.resume && scope.feeds;
}

/**
 * Derive a minimal rebuild scope from a DynamoDB Streams batch of PUBLISHED items.
 * Unknown entity types are ignored (Notebook / future entities must opt in).
 */
export function collectRebuildScope(records: DynamoDBRecord[]): RebuildScope {
  const postSlugs = new Set<string>();
  const slugsToRemove = new Set<string>();
  let home = false;
  let resume = false;
  let feeds = false;

  for (const record of records) {
    const oldMeta = imageToStreamMeta(record.dynamodb?.OldImage);
    const newMeta = imageToStreamMeta(record.dynamodb?.NewImage);
    const entity = newMeta?.entityType ?? oldMeta?.entityType ?? undefined;

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

    // Posts only (entityType post or legacy missing type on post snapshots).
    if (entity != null && entity !== 'post') continue;

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
  };
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

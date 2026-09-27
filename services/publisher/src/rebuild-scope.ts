import type { DynamoDBRecord, AttributeValue } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';

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

export function imageToStreamMeta(
  image: Record<string, AttributeValue> | undefined,
): StreamMeta | undefined {
  if (!image) return undefined;
  const item = unmarshall(
    image as Parameters<typeof unmarshall>[0],
  ) as StreamMeta;
  if (item.sk !== 'PUBLISHED') return undefined;
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

/**
 * Derive a minimal rebuild scope from a DynamoDB Streams batch of PUBLISHED items.
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
    const entity =
      newMeta?.entityType ?? oldMeta?.entityType ?? undefined;

    if (entity === 'home') {
      if (
        newMeta?.status === 'published' ||
        oldMeta?.status === 'published'
      ) {
        home = true;
      }
      continue;
    }

    if (entity === 'resume') {
      if (
        newMeta?.status === 'published' ||
        oldMeta?.status === 'published'
      ) {
        resume = true;
      }
      continue;
    }

    // Posts (and unknown PUBLISHED entities): treat like posts when a published side exists.
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
      !(
        newMeta?.status === 'published' && newMeta.slug === oldMeta.slug
      )
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

/**
 * CloudFront invalidation paths for a rebuild. Prefer wildcards so a single
 * post publish stays around ≤5 paths regardless of catalog size.
 *
 * Only paths whose objects actually changed (or were deleted) are included,
 * except full rebuild which uses `/*`.
 */
export function buildInvalidationPaths(input: {
  scope: RebuildScope;
  /** Object keys that were actually written or deleted (no leading slash). */
  changedKeys: Iterable<string>;
  removedSlugs: Iterable<string>;
}): string[] {
  const { scope } = input;
  const changed = new Set(input.changedKeys);
  const removed = [...input.removedSlugs];
  const paths = new Set<string>();

  if (changed.size === 0 && removed.length === 0) {
    return [];
  }

  // Full rebuild: one wildcard covers the site.
  if (scope.allPosts && scope.home && scope.resume && scope.feeds) {
    return ['/*'];
  }

  const blogOrFeedChanged =
    [...changed].some(
      (key) =>
        key.startsWith('blog/') ||
        key === 'sitemap.xml' ||
        key === 'rss.xml',
    ) || removed.length > 0;

  if (blogOrFeedChanged) {
    // One wildcard covers /blog, index, posts.json, slugs.json, and every slug.
    paths.add('/blog*');
    if (changed.has('sitemap.xml') || removed.length > 0 || scope.feeds) {
      paths.add('/sitemap.xml');
    }
    if (changed.has('rss.xml') || removed.length > 0 || scope.feeds) {
      paths.add('/rss.xml');
    }
  }

  if (changed.has('resume/index.html') || changed.has('resume.pdf')) {
    // Covers /resume, /resume/, /resume/index.html, and /resume.pdf.
    paths.add('/resume*');
  }

  if (changed.has('index.html')) {
    paths.add('/');
    paths.add('/index.html');
  }

  if (paths.size === 0 && removed.length > 0) {
    paths.add('/blog*');
    paths.add('/sitemap.xml');
    paths.add('/rss.xml');
  }

  return [...paths];
}

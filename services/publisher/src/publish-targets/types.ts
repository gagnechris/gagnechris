import type { Home, Post, Resume } from '@gagnechris/shared';
import type { RebuildScope } from '../rebuild-scope.js';
import type { SiteStorage } from '../storage.js';

/** Discriminated lookup so corrupt rows are not treated as unpublished (CHR-160). */
export type PublishedLookup<T> =
  { status: 'ok'; entity: T } | { status: 'missing' } | { status: 'corrupt' };

export type PublishedPostsCatalog = {
  posts: Post[];
  /** Slugs whose PUBLISHED rows failed validation — preserve live pages. */
  corruptSlugs: string[];
};

export type RebuildSiteSources = {
  listPublishedPosts: () => Promise<PublishedPostsCatalog>;
  getPublishedResume: () => Promise<PublishedLookup<Resume>>;
  getPublishedHome: () => Promise<PublishedLookup<Home>>;
};

export const CACHE_HTML = 'public,max-age=0,must-revalidate';
export const CACHE_FEED = 'public,max-age=300';

export type PublishArtifact = {
  key: string;
  body: string | Uint8Array;
  contentType: string;
  cacheControl: string;
  contentDisposition?: string;
};

export type PublishTargetContext = {
  scope: RebuildScope;
  shell: string;
  /**
   * Read/list only. Targets return `artifacts` / `deleteKeys`; the orchestrator
   * performs all writes, deletes, and invalidation.
   */
  storage: SiteStorage;
  sources: RebuildSiteSources;
  /** Published posts (loaded once per rebuild when catalog is needed). */
  published: Post[];
  /** Corrupt PUBLISHED post slugs — must not be deleted as orphans (CHR-160). */
  corruptPostSlugs: ReadonlySet<string>;
};

export type PublishTargetRunResult = {
  artifacts?: PublishArtifact[];
  deleteKeys?: string[];
  /** CloudFront paths owned by this target (orchestrator dedupes / collapses). */
  invalidationPaths?: string[];
  removedSlugs?: string[];
  resumePublished?: boolean;
  resumeUnpublished?: boolean;
  resumePdfFailed?: boolean;
  homePublished?: boolean;
  homeRestoredFromSnapshot?: boolean;
};

export type PublishTarget = {
  id: string;
  matches(scope: RebuildScope): boolean;
  needsCatalog(scope: RebuildScope): boolean;
  needsShell(scope: RebuildScope): boolean;
  run(ctx: PublishTargetContext): Promise<PublishTargetRunResult>;
};

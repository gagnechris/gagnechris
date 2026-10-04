import type { Home, Post, Project, Resume } from '@gagnechris/shared';
import type { RebuildScope } from '../rebuild-scope.js';
import type { SiteStorage } from '../storage.js';

/** Discriminated so corrupt rows are not treated as unpublished. */
export type PublishedLookup<T> =
  { status: 'ok'; entity: T } | { status: 'missing' } | { status: 'corrupt' };

export type PublishedPostsCatalog = {
  posts: Post[];
  corruptSlugs: string[];
  corruptPostIds?: string[];
};

export type PublishedProjectsCatalog = {
  projects: Project[];
  /** Slugs of corrupt PUBLISHED rows: their live pages are kept. */
  corruptSlugs: string[];
};

export type RebuildSiteSources = {
  listPublishedPosts: () => Promise<PublishedPostsCatalog>;
  listPublishedProjects: () => Promise<PublishedProjectsCatalog>;
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
  /** Read/list only: the orchestrator performs all writes, deletes, and invalidation. */
  storage: SiteStorage;
  sources: RebuildSiteSources;
  published: Post[];
  /** Live post slugs missing from `published`; must not be deleted as orphans. */
  corruptPostSlugs: ReadonlySet<string>;
  /** Feeds and Home Recent posts only; their pages are never re-rendered. */
  retainedPosts: Post[];
  /** Empty unless an active target's `needsProjects` is true. */
  projects: PublishedProjectsCatalog;
};

export type PublishTargetRunResult = {
  artifacts?: PublishArtifact[];
  deleteKeys?: string[];
  invalidationPaths?: string[];
  removedSlugs?: string[];
  resumePublished?: boolean;
  resumeUnpublished?: boolean;
  resumePdfFailed?: boolean;
  homePublished?: boolean;
  homeRestoredFromSnapshot?: boolean;
};

export const PUBLISH_RESULT_BOOLEAN_FLAGS = [
  'resumePublished',
  'resumeUnpublished',
  'resumePdfFailed',
  'homePublished',
  'homeRestoredFromSnapshot',
] as const satisfies readonly (keyof PublishTargetRunResult)[];

export type PublishResultBooleanFlag =
  (typeof PUBLISH_RESULT_BOOLEAN_FLAGS)[number];

export type PublishTarget = {
  id: string;
  /**
   * Exact page paths served from `{path}/index.html`; nothing nested under
   * them is. Omit for feed-only / orphan / home (home is `/` special-cased).
   */
  optionBPaths?: readonly string[];
  adminMutationPrefixes?: readonly string[];
  /** Soft-delete removes the PUBLISHED snapshot, so DELETE is publish-relevant. */
  adminSoftDelete?: boolean;
  matches(scope: RebuildScope): boolean;
  needsCatalog(scope: RebuildScope): boolean;
  needsShell(scope: RebuildScope): boolean;
  needsProjects?(scope: RebuildScope): boolean;
  run(ctx: PublishTargetContext): Promise<PublishTargetRunResult>;
};

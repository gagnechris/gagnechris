import type { Home, Post, Project, Resume } from '@gagnechris/shared';
import type { RebuildScope } from '../rebuild-scope.js';
import type { PublishArtifact, SiteStorage } from '../storage.js';
import type { KvsNamespace } from '../viewer-request-slugs.js';

export type { PublishArtifact };

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
  /** Moves on every commit that writes or deletes a PUBLISHED row; read consistently. */
  readGeneration: () => Promise<number>;
  listPublishedPosts: () => Promise<PublishedPostsCatalog>;
  listPublishedProjects: () => Promise<PublishedProjectsCatalog>;
  getPublishedResume: () => Promise<PublishedLookup<Resume>>;
  getPublishedHome: () => Promise<PublishedLookup<Home>>;
};

export const CACHE_HTML = 'public,max-age=0,must-revalidate';
export const CACHE_FEED = 'public,max-age=300';

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
  /** `published` and `retainedPosts`, newest first: what feeds and indexes list. */
  feedPosts: Post[];
  /** Empty unless an active target needs `projects`. */
  projects: PublishedProjectsCatalog;
};

export type PublishTargetRunResult = {
  artifacts?: PublishArtifact[];
  deleteKeys?: string[];
  /** Sent only when an artifact was written or a delete removed something. */
  invalidationPaths?: string[];
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
  /**
   * Every S3 key this target writes or deletes, as `aws s3 sync --exclude`
   * patterns. Web deploys and the local seed keep these keys.
   */
  s3Outputs: readonly string[];
  matches(scope: RebuildScope): boolean;
  /** What `run` reads from the context; loaded only when an active target needs it. */
  needs: { posts?: true; shell?: true; projects?: true };
  /** The viewer-request KVS namespace that allowlists this target's pages. */
  kvs?: {
    namespace: KvsNamespace;
    pagePrefix: string;
    keysFromPageKeys: (pageKeys: string[]) => string[];
  };
  run(ctx: PublishTargetContext): Promise<PublishTargetRunResult>;
};

import type { Home, Post, Resume } from '@gagnechris/shared';
import type { RebuildScope } from '../rebuild-scope.js';
import type { SiteStorage } from '../storage.js';

export type RebuildSiteSources = {
  listPublishedPosts: () => Promise<Post[]>;
  getPublishedResume: () => Promise<Resume | undefined>;
  getPublishedHome: () => Promise<Home | undefined>;
};

export const CACHE_HTML = 'public,max-age=0,must-revalidate';
export const CACHE_FEED = 'public,max-age=300';

export type PublishArtifact = {
  key: string;
  body: string;
  contentType: string;
  cacheControl: string;
  contentDisposition?: string;
};

export type PublishTargetContext = {
  scope: RebuildScope;
  shell: string;
  storage: SiteStorage;
  sources: RebuildSiteSources;
  /** Published posts (loaded once per rebuild when catalog is needed). */
  published: Post[];
};

export type PublishTargetRunResult = {
  artifacts?: PublishArtifact[];
  deleteKeys?: string[];
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

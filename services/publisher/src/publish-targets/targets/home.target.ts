import {
  DEFAULT_HOME,
  selectHomeProjects,
  type Home,
} from '@gagnechris/shared';
import { selectHomeRecentPosts } from '@gagnechris/shared/render';
import {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
  readHomePublishSnapshot,
  snapshotToHome,
} from '../../home-publish.js';
import {
  PROJECT_ENTITY_TYPE,
  isFullRebuildScope,
  type RebuildScope,
} from '../../rebuild-scope.js';
import { renderHomePage } from '../../render.js';
import { htmlArtifact, jsonArtifact } from '../artifacts.js';
import type {
  PublishArtifact,
  PublishTarget,
  PublishTargetContext,
} from '../types.js';

const homePageArtifact = (
  ctx: PublishTargetContext,
  home: Home,
): PublishArtifact =>
  htmlArtifact(
    'index.html',
    renderHomePage(
      ctx.shell,
      home,
      selectHomeRecentPosts(ctx.feedPosts),
      selectHomeProjects(ctx.projects.projects),
    ),
  );

// Unchanged bytes are skipped by storage.put, and the orchestrator only
// invalidates for targets that wrote, so post and project edits that don't
// change what Home lists leave `/` alone.
const INVALIDATION_PATHS = ['/', '/index.html'];

const rendersHome = (scope: RebuildScope): boolean =>
  scope.home ||
  scope.feeds ||
  scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) ||
  isFullRebuildScope(scope);

const target: PublishTarget = {
  id: 'home',
  // `index.html` is the web deploy's shell; republishAll re-renders it, so
  // only the snapshot needs protecting.
  s3Outputs: ['home/*'],
  // Home is `/` (special-cased in viewer-request), not Option B.
  adminMutationPrefixes: [
    '/api/admin/home',
    '/api/admin/posts',
    '/api/admin/projects',
  ],
  matches: rendersHome,
  // Every render needs both lists, or one section drops off `/`.
  needs: { posts: true, shell: true, projects: true },
  async run(ctx) {
    const lookup = await ctx.sources.getPublishedHome();
    if (lookup.status === 'ok') {
      const home = lookup.entity;
      return {
        artifacts: [
          homePageArtifact(ctx, home),
          jsonArtifact(HOME_LAST_PUBLISHED_KEY, homeToSnapshot(home)),
        ],
        invalidationPaths: INVALIDATION_PATHS,
        homePublished: true,
      };
    }
    const snapshot = await readHomePublishSnapshot(ctx.storage);
    if (snapshot) {
      return {
        artifacts: [homePageArtifact(ctx, snapshotToHome(snapshot))],
        invalidationPaths: INVALIDATION_PATHS,
        homeRestoredFromSnapshot: true,
      };
    }
    // A corrupt row with no snapshot keeps whatever `/` serves now. Home that
    // was never published renders the bundled default, which is what the SPA
    // falls back to anyway, so Recent posts still reach `/`.
    if (lookup.status === 'corrupt') return {};
    return {
      artifacts: [homePageArtifact(ctx, DEFAULT_HOME)],
      invalidationPaths: INVALIDATION_PATHS,
    };
  },
};

export default target;

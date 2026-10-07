import { projectBuildLogPosts, projectHasPage } from '@gagnechris/shared';
import {
  PROJECT_ENTITY_TYPE,
  isFullRebuildScope,
} from '../../rebuild-scope.js';
import { renderProjectPage, renderProjectsIndexPage } from '../../render.js';
import { projectPageKey, projectSlugsFromKeys } from '../../storage.js';
import {
  PROJECT_SLUG_NAMESPACE,
  projectSlugKvsKey,
} from '../../viewer-request-slugs.js';
import { htmlArtifact } from '../artifacts.js';
import type { PublishArtifact, PublishTarget } from '../types.js';

export const PROJECTS_INDEX_KEY = 'projects/index.html';

const PAGE_KEY_RE = /^projects\/([^/]+)\/index\.html$/;

const target: PublishTarget = {
  id: 'projects',
  s3Outputs: ['projects/*'],
  optionBPaths: ['/projects'],
  adminMutationPrefixes: ['/api/admin/projects'],
  adminSoftDelete: true,
  matches(scope) {
    return (
      scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) ||
      isFullRebuildScope(scope) ||
      scope.projectIds.size > 0
    );
  },
  needs: { posts: true, shell: true, projects: true },
  // The pages in storage after this run's writes and deletes, so href cards
  // and body-less ideas (no page) stay out and kept pages of corrupt rows
  // stay in.
  kvs: {
    namespace: PROJECT_SLUG_NAMESPACE,
    pagePrefix: 'projects/',
    keysFromPageKeys: (keys) =>
      projectSlugsFromKeys(keys).map(projectSlugKvsKey),
  },
  async run(ctx) {
    const { scope, shell, storage, published } = ctx;
    const { projects, corruptSlugs } = ctx.projects;
    const paged = projects.filter(projectHasPage);
    const page = (project: (typeof paged)[number]): PublishArtifact =>
      htmlArtifact(
        projectPageKey(project.slug),
        renderProjectPage(
          shell,
          project,
          projectBuildLogPosts(project.id, published),
        ),
      );

    // A post change only reaches the Build logs of the projects it was tagged
    // with; the index shows no posts.
    if (
      !scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) &&
      !isFullRebuildScope(scope)
    ) {
      return {
        artifacts: paged.filter((p) => scope.projectIds.has(p.id)).map(page),
        invalidationPaths: ['/projects*'],
      };
    }
    const keep = new Set([
      ...paged.map((p) => projectPageKey(p.slug)),
      ...corruptSlugs.map(projectPageKey),
    ]);

    const artifacts: PublishArtifact[] = paged.map(page);
    const deleteKeys = (await storage.list('projects/')).filter(
      (key) => PAGE_KEY_RE.test(key) && !keep.has(key),
    );

    // The nav always links `/projects`, so it gets an index (the empty state
    // when nothing is published). An index of only corrupt rows would drop
    // their live pages from it, so the one already there is kept.
    const keepIndex =
      projects.length === 0 &&
      corruptSlugs.length > 0 &&
      (await storage.read(PROJECTS_INDEX_KEY)) !== undefined;
    if (!keepIndex) {
      artifacts.push(
        htmlArtifact(
          PROJECTS_INDEX_KEY,
          renderProjectsIndexPage(shell, projects),
        ),
      );
    }

    return { artifacts, deleteKeys, invalidationPaths: ['/projects*'] };
  },
};

export default target;

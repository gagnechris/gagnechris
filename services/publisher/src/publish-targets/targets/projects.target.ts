import { projectHasPage } from '@gagnechris/shared';
import {
  PROJECT_ENTITY_TYPE,
  isFullRebuildScope,
} from '../../rebuild-scope.js';
import { renderProjectPage, renderProjectsIndexPage } from '../../render.js';
import type { PublishArtifact, PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

export const PROJECTS_INDEX_KEY = 'projects/index.html';

const projectPageKey = (slug: string): string => `projects/${slug}/index.html`;

const PAGE_KEY_RE = /^projects\/([^/]+)\/index\.html$/;

const target: PublishTarget = {
  id: 'projects',
  optionBPaths: ['/projects'],
  adminMutationPrefixes: ['/api/admin/projects'],
  adminSoftDelete: true,
  matches(scope) {
    return (
      scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) ||
      isFullRebuildScope(scope)
    );
  },
  needsCatalog: () => false,
  needsShell(scope) {
    return this.matches(scope);
  },
  needsProjects(scope) {
    return this.matches(scope);
  },
  async run(ctx) {
    const { shell, storage } = ctx;
    const { projects, corruptSlugs } = ctx.projects;
    const paged = projects.filter(projectHasPage);
    const keep = new Set([
      ...paged.map((p) => projectPageKey(p.slug)),
      ...corruptSlugs.map(projectPageKey),
    ]);

    const artifacts: PublishArtifact[] = paged.map((project) => ({
      key: projectPageKey(project.slug),
      body: renderProjectPage(shell, project),
      contentType: 'text/html; charset=utf-8',
      cacheControl: CACHE_HTML,
    }));
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
      artifacts.push({
        key: PROJECTS_INDEX_KEY,
        body: renderProjectsIndexPage(shell, projects),
        contentType: 'text/html; charset=utf-8',
        cacheControl: CACHE_HTML,
      });
    }

    return { artifacts, deleteKeys, invalidationPaths: ['/projects*'] };
  },
};

export default target;

import { isSafeLinkHref, POST_LINK_SCHEMES } from './links.js';
import { renderProjectMarkdownToHtml } from './markdown.js';
import {
  PROJECTS_INDEX_TITLE,
  type ProjectBuildLogPost,
  type ProjectCardSource,
  type ProjectPageView,
} from './projects.js';
import type { Project } from './schemas.js';

export { PROJECTS_INDEX_TITLE };

export type ProjectsIndexItem = ProjectCardSource;

/** Unsafe links are dropped here, so the page never renders them. */
export const projectPageView = (
  project: Pick<
    Project,
    | 'slug'
    | 'name'
    | 'pitch'
    | 'stage'
    | 'stageNote'
    | 'previewImage'
    | 'demo'
    | 'bodyMarkdown'
    | 'stack'
    | 'links'
  >,
  buildLog: readonly ProjectBuildLogPost[] = [],
): ProjectPageView => ({
  slug: project.slug,
  name: project.name,
  pitch: project.pitch,
  stage: project.stage,
  stageNote: project.stageNote,
  previewImage: project.previewImage,
  demo: project.demo,
  bodyHtml: renderProjectMarkdownToHtml(project.bodyMarkdown),
  stack: project.stack,
  links: project.links.filter((l) => isSafeLinkHref(l.url, POST_LINK_SCHEMES)),
  buildLog: buildLog.map(({ id, slug, title, publishedAt }) => ({
    id,
    slug,
    title,
    publishedAt,
  })),
});

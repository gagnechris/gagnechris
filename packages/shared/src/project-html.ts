import { escapeHtml } from './html.js';
import { isSafeLinkHref, POST_LINK_SCHEMES } from './links.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import {
  PROJECT_STAGE_LABELS,
  PROJECTS_PATH,
  projectCardHref,
  sortProjectsByOrder,
} from './projects.js';
import type { Project } from './schemas.js';
import { renderSitePageHtml } from './site-chrome-html.js';

export const PROJECTS_INDEX_TITLE = 'Projects';

export type ProjectsIndexItem = Pick<
  Project,
  | 'id'
  | 'slug'
  | 'name'
  | 'pitch'
  | 'stage'
  | 'stageNote'
  | 'stack'
  | 'order'
  | 'bodyMarkdown'
  | 'href'
>;

const stageHtml = (project: Pick<Project, 'stage' | 'stageNote'>): string =>
  `<p class="project-stage" data-stage="${project.stage}">` +
  escapeHtml(PROJECT_STAGE_LABELS[project.stage]) +
  (project.stageNote ? `, ${escapeHtml(project.stageNote)}` : '') +
  `</p>`;

const stackHtml = (stack: readonly string[]): string =>
  stack.length
    ? `<p class="project-stack">${stack.map(escapeHtml).join(' · ')}</p>`
    : '';

const projectItemHtml = (project: ProjectsIndexItem): string => {
  const href = projectCardHref(project);
  const name = escapeHtml(project.name);
  return (
    `<li class="projects-list__item" data-slug="${escapeHtml(project.slug)}">` +
    `<h2 class="project-name">${href ? `<a href="${escapeHtml(href)}">${name}</a>` : name}</h2>` +
    stageHtml(project) +
    (project.pitch
      ? `<p class="project-pitch">${escapeHtml(project.pitch)}</p>`
      : '') +
    stackHtml(project.stack) +
    `</li>`
  );
};

/** Deliberately bare: the designed index replaces this markup. */
export const renderProjectsIndexBodyHtml = (
  projects: readonly ProjectsIndexItem[],
): string =>
  `<main class="projects-page">` +
  `<h1>${PROJECTS_INDEX_TITLE}</h1>` +
  `<ul class="projects-list">` +
  sortProjectsByOrder(projects).map(projectItemHtml).join('') +
  `</ul></main>`;

const linksHtml = (links: Project['links']): string => {
  const safe = links.filter((l) => isSafeLinkHref(l.url, POST_LINK_SCHEMES));
  if (!safe.length) return '';
  return (
    `<ul class="project-links">` +
    safe
      .map(
        (l) =>
          `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></li>`,
      )
      .join('') +
    `</ul>`
  );
};

/** Deliberately bare: the designed project page replaces this markup. */
export const renderProjectPageBodyHtml = (
  project: Pick<
    Project,
    | 'slug'
    | 'name'
    | 'pitch'
    | 'stage'
    | 'stageNote'
    | 'bodyMarkdown'
    | 'stack'
    | 'links'
  >,
): string =>
  `<main class="project-page" data-slug="${escapeHtml(project.slug)}">` +
  `<p class="project-back"><a href="${PROJECTS_PATH}">${PROJECTS_INDEX_TITLE}</a></p>` +
  stageHtml(project) +
  `<h1>${escapeHtml(project.name)}</h1>` +
  (project.pitch
    ? `<p class="project-pitch">${escapeHtml(project.pitch)}</p>`
    : '') +
  `<div class="project-body">${renderPostMarkdownToHtml(project.bodyMarkdown)}</div>` +
  stackHtml(project.stack) +
  linksHtml(project.links) +
  `</main>`;

export const renderProjectsIndexPrerenderHtml = (
  projects: readonly ProjectsIndexItem[],
  year?: number | string,
): string =>
  renderSitePageHtml(
    PROJECTS_PATH,
    renderProjectsIndexBodyHtml(projects),
    year,
  );

export const renderProjectPagePrerenderHtml = (
  project: Parameters<typeof renderProjectPageBodyHtml>[0],
  year?: number | string,
): string =>
  renderSitePageHtml(PROJECTS_PATH, renderProjectPageBodyHtml(project), year);

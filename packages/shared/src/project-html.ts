import { escapeHtml } from './html.js';
import { isSafeLinkHref, POST_LINK_SCHEMES } from './links.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import { formatPostShortDate, postDateAttribute } from './post-date.js';
import {
  PROJECT_IDEA_PREVIEW_TEXT,
  PROJECT_MINI_UI,
  PROJECT_PREVIEW_HEIGHT,
  PROJECT_PREVIEW_WIDTH,
  PROJECT_STAGE_LABELS,
  PROJECTS_INDEX_EMPTY_TEXT,
  PROJECTS_INDEX_INTRO,
  PROJECTS_PATH,
  projectBuildLogEmptyText,
  projectCardViews,
  projectPreview,
  projectStageText,
  type ProjectBuildLogPost,
  type ProjectCardSource,
  type ProjectCardView,
  type ProjectMiniNode,
} from './projects.js';
import type { Project } from './schemas.js';
import { renderSitePageHtml } from './site-chrome-html.js';

export const PROJECTS_INDEX_TITLE = 'Projects';

export type ProjectsIndexItem = ProjectCardSource;

const stageHtml = (project: Pick<Project, 'stage' | 'stageNote'>): string =>
  `<p class="project-stage" data-stage="${project.stage}">` +
  escapeHtml(PROJECT_STAGE_LABELS[project.stage]) +
  (project.stageNote ? `, ${escapeHtml(project.stageNote)}` : '') +
  `</p>`;

const stackHtml = (stack: readonly string[]): string =>
  stack.length
    ? `<p class="project-stack">${stack.map(escapeHtml).join(' · ')}</p>`
    : '';

const miniHtml = (nodes: readonly ProjectMiniNode[]): string =>
  nodes
    .map(
      ({ className, text, children }) =>
        `<span class="${className}">` +
        (text ? escapeHtml(text) : '') +
        (children ? miniHtml(children) : '') +
        `</span>`,
    )
    .join('');

const previewHtml = (card: ProjectCardView): string => {
  const preview = projectPreview(card);
  switch (preview.kind) {
    case 'image':
      return (
        `<div class="project-preview project-preview--image">` +
        `<img alt="" width="${PROJECT_PREVIEW_WIDTH}" height="${PROJECT_PREVIEW_HEIGHT}" src="${escapeHtml(preview.src)}">` +
        `</div>`
      );
    case 'idea':
      return `<div class="project-preview project-preview--idea" aria-hidden="true">${escapeHtml(PROJECT_IDEA_PREVIEW_TEXT)}</div>`;
    case 'mini':
      return (
        `<div class="project-preview project-preview--${preview.mini}" aria-hidden="true">` +
        miniHtml(PROJECT_MINI_UI[preview.mini]) +
        `</div>`
      );
  }
};

/*
 * React's ProjectCard renders exactly this (ProjectCard.test.tsx), and
 * `projectCardsFromDocument` reads it back on a cold load.
 */
export const renderProjectCardHtml = (
  card: ProjectCardView,
  heading: 'h2' | 'h3',
): string => {
  const inner =
    previewHtml(card) +
    `<div class="project-card__text">` +
    `<p class="project-stage" data-stage="${card.stage}">${escapeHtml(projectStageText(card))}</p>` +
    `<${heading} class="project-card__name">${escapeHtml(card.name)}</${heading}>` +
    (card.pitch
      ? `<p class="project-card__pitch">${escapeHtml(card.pitch)}</p>`
      : '') +
    (card.stack.length
      ? `<p class="project-card__stack">` +
        card.stack.map((s) => `<span>${escapeHtml(s)}</span>`).join(' · ') +
        `</p>`
      : '') +
    `</div>`;
  return (
    `<li class="project-card" data-id="${escapeHtml(card.id)}" data-slug="${escapeHtml(card.slug)}"${card.demo ? ` data-demo="${card.demo}"` : ''}>` +
    (card.href
      ? `<a class="project-card__link" href="${escapeHtml(card.href)}">${inner}</a>`
      : `<div class="project-card__link">${inner}</div>`) +
    `</li>`
  );
};

export const renderProjectsIndexBodyHtml = (
  projects: readonly ProjectsIndexItem[],
): string => {
  const cards = projectCardViews(projects);
  return (
    `<div class="projects-index">` +
    `<header class="projects-index__header">` +
    `<h1>${PROJECTS_INDEX_TITLE}</h1>` +
    `<p class="projects-index__intro">${escapeHtml(PROJECTS_INDEX_INTRO)}</p>` +
    `</header>` +
    `<main>` +
    (cards.length
      ? `<ul class="project-list">${cards.map((c) => renderProjectCardHtml(c, 'h2')).join('')}</ul>`
      : `<p class="projects-index__empty">${escapeHtml(PROJECTS_INDEX_EMPTY_TEXT)}</p>`) +
    `</main>` +
    `</div>`
  );
};

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

const buildLogHtml = (
  name: string,
  posts: readonly ProjectBuildLogPost[],
): string =>
  `<section class="project-build-log" aria-labelledby="project-build-log">` +
  `<h2 id="project-build-log">Build log</h2>` +
  (posts.length
    ? `<ul>` +
      posts
        .map((post) => {
          const date = formatPostShortDate(post.publishedAt);
          const attr = postDateAttribute(post.publishedAt);
          return (
            `<li data-id="${escapeHtml(post.id)}">` +
            `<a href="/posts/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a>` +
            (date
              ? ` <time${attr ? ` datetime="${attr}"` : ''}>${escapeHtml(date)}</time>`
              : '') +
            `</li>`
          );
        })
        .join('') +
      `</ul>`
    : `<p>${escapeHtml(projectBuildLogEmptyText(name))}</p>`) +
  `</section>`;

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
  buildLog: readonly ProjectBuildLogPost[] = [],
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
  buildLogHtml(project.name, buildLog) +
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
  buildLog: readonly ProjectBuildLogPost[] = [],
  year?: number | string,
): string =>
  renderSitePageHtml(
    PROJECTS_PATH,
    renderProjectPageBodyHtml(project, buildLog),
    year,
  );

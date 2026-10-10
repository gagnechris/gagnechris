import { escapeHtml } from './html.js';
import { isSafeLinkHref, POST_LINK_SCHEMES } from './links.js';
import { renderProjectMarkdownToHtml } from './markdown.js';
import { formatPostDate, postDateAttribute } from './post-date.js';
import {
  PROJECT_IDEA_PREVIEW_TEXT,
  PROJECT_MINI_UI,
  PROJECT_PREVIEW_HEIGHT,
  PROJECT_PREVIEW_WIDTH,
  PROJECTS_INDEX_TITLE,
  PROJECTS_PATH,
  PROJECT_BUILD_LOG_HEADING,
  PROJECT_BUILD_LOG_ID,
  PROJECT_BUILD_LOG_RSS_LINK,
  PROJECT_DEMO_LABEL,
  PROJECT_DEMO_LABEL_ID,
  projectBuildLogEmptyText,
  projectPreview,
  projectStageText,
  type ProjectBuildLogPost,
  type ProjectCardSource,
  type ProjectCardView,
  type ProjectMiniNode,
  type ProjectPageView,
} from './projects.js';
import type { Project } from './schemas.js';

export { PROJECTS_INDEX_TITLE };

export type ProjectsIndexItem = ProjectCardSource;

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

const previewHtml = (
  card: Pick<ProjectCardView, 'previewImage' | 'stage' | 'demo'>,
): string => {
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

const projectStackHtml = (stack: readonly string[]): string =>
  stack.length
    ? `<p class="project-stack">` +
      stack.map((s) => `<span>${escapeHtml(s)}</span>`).join(' · ') +
      `</p>`
    : '';

const linksHtml = (links: Project['links']): string =>
  links.length
    ? `<ul class="project-links">` +
      links
        .map(
          (l) =>
            `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></li>`,
        )
        .join('') +
      `</ul>`
    : '';

const buildLogEntryHtml = (post: ProjectBuildLogPost): string => {
  const date = formatPostDate(post.publishedAt);
  const attr = postDateAttribute(post.publishedAt);
  return (
    `<li class="project-build-log__entry" data-id="${escapeHtml(post.id)}">` +
    `<a class="project-build-log__link" href="/posts/${escapeHtml(post.slug)}">` +
    `<h3 class="project-build-log__title">${escapeHtml(post.title)}</h3>` +
    (date
      ? `<time class="project-build-log__date"${attr ? ` datetime="${attr}"` : ''}>${escapeHtml(date)}</time>`
      : '') +
    `</a></li>`
  );
};

const buildLogHtml = (
  name: string,
  posts: readonly ProjectBuildLogPost[],
): string =>
  `<section class="project-build-log" aria-labelledby="${PROJECT_BUILD_LOG_ID}">` +
  `<h2 id="${PROJECT_BUILD_LOG_ID}">${PROJECT_BUILD_LOG_HEADING}</h2>` +
  (posts.length
    ? `<ul class="project-build-log__list">${posts.map(buildLogEntryHtml).join('')}</ul>`
    : `<p class="project-build-log__empty">${escapeHtml(projectBuildLogEmptyText(name))} ` +
      `<a href="${PROJECT_BUILD_LOG_RSS_LINK.href}">${PROJECT_BUILD_LOG_RSS_LINK.label}</a>.</p>`) +
  `</section>`;

/** Only when `demo` is set. Without script, or until the demo loads, it shows the preview. */
const demoHtml = (view: ProjectPageView): string =>
  view.demo
    ? `<section class="project-demo" aria-labelledby="${PROJECT_DEMO_LABEL_ID}">` +
      `<h2 class="project-demo__label" id="${PROJECT_DEMO_LABEL_ID}">${PROJECT_DEMO_LABEL}</h2>` +
      `<div class="project-demo__stage">${previewHtml(view)}</div>` +
      `</section>`
    : '';

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

/*
 * `apps/web/src/projects/ProjectPageBody.tsx` renders the same markup
 * (ProjectPageBody.test.tsx), and `projectPageViewFromDocument` reads it back
 * on a cold load.
 */
export const renderProjectPageBodyHtml = (view: ProjectPageView): string =>
  `<main class="project-page" data-slug="${escapeHtml(view.slug)}"${view.demo ? ` data-demo="${view.demo}"` : ''}>` +
  `<header class="project-header">` +
  `<p class="project-back"><a href="${PROJECTS_PATH}">${PROJECTS_INDEX_TITLE}</a></p>` +
  `<p class="project-stage" data-stage="${view.stage}">${escapeHtml(projectStageText(view))}</p>` +
  `<h1>${escapeHtml(view.name)}</h1>` +
  (view.pitch ? `<p class="project-pitch">${escapeHtml(view.pitch)}</p>` : '') +
  `</header>` +
  demoHtml(view) +
  `<div class="project-main">` +
  `<div class="post-content project-body">${view.bodyHtml}</div>` +
  projectStackHtml(view.stack) +
  linksHtml(view.links) +
  buildLogHtml(view.name, view.buildLog) +
  `</div>` +
  `</main>`;

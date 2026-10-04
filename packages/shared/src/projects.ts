import type { Post, Project, ProjectStage } from './schemas.js';

export const PROJECTS_PATH = '/projects';

export const PROJECT_STAGE_LABELS: Readonly<Record<ProjectStage, string>> = {
  idea: 'Idea',
  building: 'Building',
  live: 'Live',
};

type PageFields = Pick<Project, 'stage' | 'bodyMarkdown' | 'href'>;

/** An `idea` with no body, or a project that links elsewhere, has no page of its own. */
export const projectHasPage = (project: PageFields): boolean =>
  !project.href &&
  !(project.stage === 'idea' && project.bodyMarkdown.trim() === '');

export const projectPagePath = (slug: string): string =>
  `${PROJECTS_PATH}/${slug}`;

/** Where a project card links: its `href`, its own page, or nowhere. */
export const projectCardHref = (
  project: PageFields & Pick<Project, 'slug'>,
): string | null =>
  project.href ||
  (projectHasPage(project) ? projectPagePath(project.slug) : null);

export type PostProjectLink = { name: string; href: string | null };

export const POST_PART_OF_LABEL = 'Part of the';

/** Text before link `index` of `count`: "A", "A and B", "A, B and C". */
export const postPartOfSeparator = (index: number, count: number): string =>
  index === 0 ? '' : index === count - 1 ? ' and ' : ', ';

export const postPartOfSuffix = (count: number): string =>
  count === 1 ? ' project' : ' projects';

/** Resolved at render time, so a renamed project slug is picked up on the next rebuild. Unpublished ids are skipped. */
export const postProjectLinks = (
  projectIds: readonly string[],
  projects: readonly (PageFields & Pick<Project, 'id' | 'slug' | 'name'>)[],
): PostProjectLink[] => {
  const byId = new Map(projects.map((p) => [p.id, p]));
  return [...new Set(projectIds)].flatMap((id) => {
    const project = byId.get(id);
    return project
      ? [{ name: project.name, href: projectCardHref(project) }]
      : [];
  });
};

export type ProjectBuildLogPost = Pick<
  Post,
  'id' | 'slug' | 'title' | 'publishedAt'
>;

/** `posts` arrive newest first from the published catalog. */
export const projectBuildLogPosts = <
  T extends ProjectBuildLogPost & Pick<Post, 'projectIds'>,
>(
  projectId: string,
  posts: readonly T[],
): T[] => posts.filter((p) => p.projectIds.includes(projectId));

export const PROJECT_BUILD_LOG_HEADING = 'Build log';
export const PROJECT_BUILD_LOG_ID = 'project-build-log';

/** The empty Build log: this sentence, then the RSS link. */
export const projectBuildLogEmptyText = (name: string): string =>
  `No posts about ${name} yet.`;

export const PROJECT_BUILD_LOG_RSS_LINK = {
  label: 'Follow along via RSS',
  href: '/rss.xml',
} as const;

export type ProjectPublishFieldErrors = {
  previewImage?: 'required_with_demo';
};

/** Drafts may break these; publishing may not. */
export const projectPublishFieldErrors = (project: {
  demo: string | null;
  previewImage: string | null;
}): ProjectPublishFieldErrors =>
  project.demo && !project.previewImage?.trim()
    ? { previewImage: 'required_with_demo' }
    : {};

export const PROJECT_DEMO_LABEL = 'Try it';
export const PROJECT_DEMO_LABEL_ID = 'project-demo-label';

/** What `/projects/<slug>` shows; the SPA parses the same fields back out of the prerender. */
export type ProjectPageView = Pick<
  Project,
  | 'slug'
  | 'name'
  | 'pitch'
  | 'stage'
  | 'stageNote'
  | 'previewImage'
  | 'demo'
  | 'stack'
  | 'links'
> & {
  /** Sanitized at publish. */
  bodyHtml: string;
  buildLog: ProjectBuildLogPost[];
};

/** `order` ascending, then name, so equal orders stay stable across rebuilds. */
export const sortProjectsByOrder = <
  T extends Pick<Project, 'order' | 'name' | 'id'>,
>(
  projects: readonly T[],
): T[] =>
  [...projects].sort(
    (a, b) =>
      a.order - b.order ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );

/** What a card shows; the SPA parses the same fields back out of the prerender. */
export type ProjectCardView = Pick<
  Project,
  | 'id'
  | 'slug'
  | 'name'
  | 'pitch'
  | 'stage'
  | 'stageNote'
  | 'stack'
  | 'previewImage'
  | 'demo'
> & { href: string | null };

export type ProjectCardSource = Omit<ProjectCardView, 'href'> &
  PageFields &
  Pick<Project, 'order'>;

export const projectCardView = ({
  id,
  slug,
  name,
  pitch,
  stage,
  stageNote,
  stack,
  previewImage,
  demo,
  ...page
}: ProjectCardSource): ProjectCardView => ({
  id,
  slug,
  name,
  pitch,
  stage,
  stageNote,
  stack,
  previewImage,
  demo,
  href: projectCardHref({ slug, stage, ...page }),
});

export const projectCardViews = (
  projects: readonly ProjectCardSource[],
): ProjectCardView[] => sortProjectsByOrder(projects).map(projectCardView);

export const HOME_PROJECTS_LIMIT = 2;

/** Ideas stay off Home: it shows what exists. */
export const selectHomeProjects = (
  projects: readonly ProjectCardSource[],
): ProjectCardView[] =>
  projectCardViews(projects.filter((p) => p.stage !== 'idea')).slice(
    0,
    HOME_PROJECTS_LIMIT,
  );

export const projectStageText = (
  project: Pick<Project, 'stage' | 'stageNote'>,
): string =>
  PROJECT_STAGE_LABELS[project.stage] +
  (project.stageNote ? ` · ${project.stageNote}` : '');

export const PROJECTS_INDEX_INTRO =
  'Things I’m building, mostly for myself, in the open. Most of them sit behind a login, so some pages have a demo you can play with.';

export const PROJECTS_INDEX_EMPTY_TEXT =
  'Nothing to show yet. The first project is on its way.';

export const PROJECT_IDEA_PREVIEW_TEXT = 'Coming soon';

export const PROJECT_PREVIEW_WIDTH = 240;
export const PROJECT_PREVIEW_HEIGHT = 160;

export type ProjectMiniNode = {
  className: string;
  text?: string;
  children?: readonly ProjectMiniNode[];
};

const node = (
  className: string,
  children?: readonly ProjectMiniNode[],
  text?: string,
): ProjectMiniNode => ({ className, children, text });

const bar = (modifier?: string): ProjectMiniNode =>
  node(
    modifier
      ? `project-mini__bar project-mini__bar--${modifier}`
      : 'project-mini__bar',
  );

const pane = (
  children: readonly ProjectMiniNode[],
  wide = false,
): ProjectMiniNode =>
  node(
    wide ? 'project-mini__pane project-mini__pane--wide' : 'project-mini__pane',
    children,
  );

const task = (done: boolean): ProjectMiniNode =>
  node('project-mini__task', [
    node(
      done
        ? 'project-mini__check project-mini__check--done'
        : 'project-mini__check',
    ),
    bar('short'),
  ]);

export type ProjectMiniKind = 'posts' | 'notebook' | 'generic';

/** The CSS mini-UI a card shows when it has no preview image. Decorative. */
export const PROJECT_MINI_UI: Readonly<
  Record<ProjectMiniKind, readonly ProjectMiniNode[]>
> = {
  posts: [
    pane([bar('title'), bar(), bar('short'), node('project-mini__button')]),
    pane([
      node('project-mini__heading', undefined, 'Welcome'),
      bar('light'),
      bar('light'),
      bar('light'),
    ]),
  ],
  notebook: [
    pane([bar('title'), task(true), task(false), bar('light')], true),
    pane([bar('sub'), bar('light'), bar('light')]),
  ],
  generic: [
    pane([bar('title'), bar(), bar('short')]),
    pane([bar('sub'), bar('light')]),
  ],
};

export type ProjectPreview =
  | { kind: 'image'; src: string }
  | { kind: 'idea' }
  | { kind: 'mini'; mini: ProjectMiniKind };

export const projectPreview = (
  project: Pick<ProjectCardView, 'previewImage' | 'stage' | 'demo'>,
): ProjectPreview =>
  project.previewImage
    ? { kind: 'image', src: project.previewImage }
    : project.stage === 'idea'
      ? { kind: 'idea' }
      : { kind: 'mini', mini: project.demo ?? 'generic' };

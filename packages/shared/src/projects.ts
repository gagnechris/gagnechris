import type { Project, ProjectStage } from './schemas.js';

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

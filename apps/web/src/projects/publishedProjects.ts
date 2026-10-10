import {
  PROJECT_DEMO_IDS,
  PROJECT_STAGE_LABELS,
  type ProjectCardView,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';

const STAGES = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];

const isStage = (value: string | null | undefined): value is ProjectStage =>
  STAGES.includes(value as ProjectStage);

const isDemo = (value: string | null): value is ProjectDemo =>
  PROJECT_DEMO_IDS.includes(value as ProjectDemo);

/** Reads back `<p class="project-stage">`: "Live", or "Live · since 2026". */
export const stageFromElement = (
  el: Element | null,
): { stage: ProjectStage; stageNote: string } | null => {
  const stage = el?.getAttribute('data-stage');
  if (!isStage(stage)) return null;
  const label = `${PROJECT_STAGE_LABELS[stage]} · `;
  const text = el?.textContent ?? '';
  return {
    stage,
    stageNote: text.startsWith(label) ? text.slice(label.length) : '',
  };
};

export const demoFrom = (el: Element): ProjectDemo | null => {
  const demo = el.getAttribute('data-demo');
  return isDemo(demo) ? demo : null;
};

export const previewImageFrom = (root: ParentNode): string | null =>
  root.querySelector('.project-preview--image img')?.getAttribute('src') ||
  null;

/** Reads back what the public-ui `ProjectCard` printed. */
export const projectCardsFromList = (list: Element): ProjectCardView[] =>
  [...list.querySelectorAll(':scope > li.project-card')].flatMap((item) => {
    const slug = item.getAttribute('data-slug') ?? '';
    const stage = stageFromElement(item.querySelector('.project-stage'));
    if (!slug || !stage) return [];
    const link = item.querySelector(':scope > a.project-card__link');
    return [
      {
        id: item.getAttribute('data-id') || slug,
        slug,
        name: item.querySelector('.project-card__name')?.textContent ?? '',
        pitch: item.querySelector('.project-card__pitch')?.textContent ?? '',
        ...stage,
        stack: [...item.querySelectorAll('.project-card__stack > span')].map(
          (s) => s.textContent ?? '',
        ),
        previewImage: previewImageFrom(item),
        demo: demoFrom(item),
        href: link?.getAttribute('href') || null,
      },
    ];
  });

export function projectsIndexFromDocument(
  root: ParentNode,
): ProjectCardView[] | null {
  // `> main` reads an index published before the page moved inside `<main>`.
  const body = root.querySelector(
    'main.projects-index > .projects-index__list, .projects-index > main',
  );
  if (!body) return null;
  const list = body.querySelector(':scope > ul.project-list');
  return list ? projectCardsFromList(list) : [];
}

export const documentProjectsIndex = (): ProjectCardView[] | null =>
  fromPrerender(projectsIndexFromDocument);

export const publishedProjectsIndexUrl = (): string =>
  publishedSiteUrl('/projects/');

export const loadPublishedProjects = (): Promise<ProjectCardView[] | null> =>
  fetchPrerender(publishedProjectsIndexUrl(), projectsIndexFromDocument);

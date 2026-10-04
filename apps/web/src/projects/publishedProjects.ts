import {
  PROJECT_DEMO_IDS,
  PROJECT_STAGE_LABELS,
  type ProjectCardView,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';

const STAGES = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];

const isStage = (value: string | null | undefined): value is ProjectStage =>
  STAGES.includes(value as ProjectStage);

const isDemo = (value: string | null): value is ProjectDemo =>
  PROJECT_DEMO_IDS.includes(value as ProjectDemo);

/** Reads back what `renderProjectCardHtml` wrote. */
export const projectCardsFromList = (list: Element): ProjectCardView[] =>
  [...list.querySelectorAll(':scope > li.project-card')].flatMap((item) => {
    const slug = item.getAttribute('data-slug') ?? '';
    const stageEl = item.querySelector('.project-stage');
    const stage = stageEl?.getAttribute('data-stage');
    if (!slug || !isStage(stage)) return [];
    const label = `${PROJECT_STAGE_LABELS[stage]} · `;
    const stageText = stageEl?.textContent ?? '';
    const demo = item.getAttribute('data-demo');
    const link = item.querySelector(':scope > a.project-card__link');
    return [
      {
        id: item.getAttribute('data-id') || slug,
        slug,
        name: item.querySelector('.project-card__name')?.textContent ?? '',
        pitch: item.querySelector('.project-card__pitch')?.textContent ?? '',
        stage,
        stageNote: stageText.startsWith(label)
          ? stageText.slice(label.length)
          : '',
        stack: [...item.querySelectorAll('.project-card__stack > span')].map(
          (s) => s.textContent ?? '',
        ),
        previewImage:
          item
            .querySelector('.project-preview--image img')
            ?.getAttribute('src') || null,
        demo: isDemo(demo) ? demo : null,
        href: link?.getAttribute('href') || null,
      },
    ];
  });

export function projectsIndexFromDocument(
  root: ParentNode,
): ProjectCardView[] | null {
  const main = root.querySelector('.projects-index > main');
  if (!main) return null;
  const list = main.querySelector(':scope > ul.project-list');
  return list ? projectCardsFromList(list) : [];
}

export const documentProjectsIndex = (): ProjectCardView[] | null =>
  fromPrerender(projectsIndexFromDocument);

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedProjectsIndexUrl(): string {
  return import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
    ? '/__site/projects/'
    : '/projects/';
}

export const loadPublishedProjects = (): Promise<ProjectCardView[] | null> =>
  fetchPrerender(publishedProjectsIndexUrl(), projectsIndexFromDocument);

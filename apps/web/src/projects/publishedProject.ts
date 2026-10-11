import { projectPageTitle, type ProjectPageView } from '@gagnechris/shared';
import {
  fetchPrerender,
  fromPrerender,
  prerenderedHead,
  type PrerenderedHead,
} from '../prerender/documentPrerender';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';
import {
  demoFrom,
  previewImageFrom,
  stageFromElement,
} from './publishedProjects';

const text = (root: ParentNode, selector: string): string =>
  root.querySelector(selector)?.textContent ?? '';

export type PublishedProjectView = ProjectPageView & { head: PrerenderedHead };

/** Reads back what public-ui's `ProjectPageBody` printed. */
export function projectPageViewFromDocument(
  root: ParentNode,
): PublishedProjectView | null {
  const page = root.querySelector('.project-page');
  const body = page?.querySelector('.project-body');
  const stage = stageFromElement(
    page?.querySelector('.project-header > .project-stage') ?? null,
  );
  if (!page || !body || !stage) return null;
  const demo = page.querySelector(':scope > .project-demo');
  const name = text(page, '.project-header > h1');
  return {
    slug: page.getAttribute('data-slug') ?? '',
    name,
    head: prerenderedHead(root, projectPageTitle(name)),
    pitch: text(page, '.project-header > .project-pitch'),
    ...stage,
    previewImage: demo ? previewImageFrom(demo) : null,
    demo: demoFrom(page),
    bodyHtml: body.innerHTML,
    stack: [...page.querySelectorAll('.project-stack > span')].map(
      (s) => s.textContent ?? '',
    ),
    links: [...page.querySelectorAll('.project-links a')].map((a) => ({
      label: a.textContent ?? '',
      url: a.getAttribute('href') ?? '',
    })),
    buildLog: [...page.querySelectorAll('.project-build-log__entry')].map(
      (entry) => ({
        id: entry.getAttribute('data-id') ?? '',
        slug: (entry.querySelector('a')?.getAttribute('href') ?? '').replace(
          /^\/posts\//,
          '',
        ),
        title: text(entry, '.project-build-log__title'),
        publishedAt:
          entry.querySelector('time')?.getAttribute('datetime') || null,
      }),
    ),
  };
}

/** Only the slug the visitor cold-loaded; later navigations fetch. */
export const documentProjectPageView = (
  slug: string,
): PublishedProjectView | null => {
  const view = fromPrerender(projectPageViewFromDocument);
  return view?.slug === slug ? view : null;
};

export const publishedProjectPageUrl = (slug: string): string =>
  publishedSiteUrl(`/projects/${slug}/`);

export const loadPublishedProject = (
  slug: string,
): Promise<PublishedProjectView | null> =>
  fetchPrerender(publishedProjectPageUrl(slug), projectPageViewFromDocument);

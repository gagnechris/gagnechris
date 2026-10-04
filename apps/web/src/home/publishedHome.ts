import {
  DEFAULT_HOME,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from '@gagnechris/shared/render';
import type { ProjectCardView } from '@gagnechris/shared';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';
import { projectCardsFromList } from '../projects/publishedProjects';
import { fetchPublishedPosts } from '../posts/publishedPosts';

export type HomeView = {
  name: string;
  title: string;
  aboutHtml: string;
};

export type HomeDocument = HomeView & {
  recentPosts: HomeRecentPost[];
  projects: ProjectCardView[];
};

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedHomeUrl(): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim();
  return localSite ? '/__site/' : '/';
}

/** Rendered from DEFAULT_HOME so the page never blanks before first publish. */
export const fallbackHomeView = (): HomeView => ({
  name: DEFAULT_HOME.name,
  title: DEFAULT_HOME.title,
  aboutHtml: renderHomeAboutHtml(DEFAULT_HOME.about),
});

const recentPostsFromDocument = (main: Element): HomeRecentPost[] =>
  [...main.querySelectorAll('.home-posts > li.home-post')].flatMap((item) => {
    const href =
      item.querySelector('.home-post__title a')?.getAttribute('href') ?? '';
    const slug = href.replace(/^\/posts\//, '');
    if (!slug || slug === href) return [];
    return [
      {
        id: item.getAttribute('data-id') || slug,
        slug,
        title: item.querySelector('.home-post__title')?.textContent ?? '',
        excerpt: item.querySelector('.home-post__excerpt')?.textContent ?? '',
        publishedAt:
          item.querySelector('time')?.getAttribute('datetime') || null,
      },
    ];
  });

export function homeDocumentFromRoot(root: ParentNode): HomeDocument | null {
  const main = root.querySelector('.home-page-prerender');
  const about = main?.querySelector('.home-hero__about');
  if (!main || !about) return null;
  const projectList = main.querySelector(':scope > section > ul.project-list');

  return {
    name: main.getAttribute('data-name') || DEFAULT_HOME.name,
    title: main.getAttribute('data-title') || DEFAULT_HOME.title,
    aboutHtml: about.innerHTML,
    recentPosts: recentPostsFromDocument(main),
    projects: projectList ? projectCardsFromList(projectList) : [],
  };
}

export const documentHome = (): HomeDocument | null =>
  fromPrerender(homeDocumentFromRoot);

/** Projects come from the published `/`: there is no projects JSON feed. */
export const loadPublishedHome = (): Promise<HomeDocument | null> =>
  fetchPrerender(publishedHomeUrl(), homeDocumentFromRoot);

export const loadRecentPosts = async (): Promise<HomeRecentPost[]> =>
  selectHomeRecentPosts(await fetchPublishedPosts());

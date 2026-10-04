import { DEFAULT_HOME, renderHomeAboutHtml } from '@gagnechris/shared/render';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';

export type HomeView = {
  name: string;
  title: string;
  aboutHtml: string;
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

export function homeViewFromDocument(root: ParentNode): HomeView | null {
  const article = root.querySelector('article.home-page-prerender');
  const about = article?.querySelector('#about .about-body');
  if (!article || !about) return null;

  return {
    name: article.getAttribute('data-name') || DEFAULT_HOME.name,
    title: article.getAttribute('data-title') || DEFAULT_HOME.title,
    aboutHtml: about.innerHTML,
  };
}

export const documentHomeView = (): HomeView | null =>
  fromPrerender(homeViewFromDocument);

export const loadPublishedHome = (): Promise<HomeView | null> =>
  fetchPrerender(publishedHomeUrl(), homeViewFromDocument);

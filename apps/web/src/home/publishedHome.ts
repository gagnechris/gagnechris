import {
  DEFAULT_HOME,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from '@gagnechris/shared/render';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';
import { fetchPublishedPosts } from '../posts/publishedPosts';

export type HomeView = {
  name: string;
  title: string;
  aboutHtml: string;
};

export type HomeDocument = HomeView & { recentPosts: HomeRecentPost[] };

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

  return {
    name: main.getAttribute('data-name') || DEFAULT_HOME.name,
    title: main.getAttribute('data-title') || DEFAULT_HOME.title,
    aboutHtml: about.innerHTML,
    recentPosts: recentPostsFromDocument(main),
  };
}

export const documentHome = (): HomeDocument | null =>
  fromPrerender(homeDocumentFromRoot);

export const loadPublishedHome = (): Promise<HomeView | null> =>
  fetchPrerender(publishedHomeUrl(), homeDocumentFromRoot);

export const loadRecentPosts = async (): Promise<HomeRecentPost[]> =>
  selectHomeRecentPosts(await fetchPublishedPosts());

import {
  DEFAULT_HOME,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from '@gagnechris/shared/render';
import type { ProjectCardView } from '@gagnechris/shared';
import {
  fetchPrerender,
  fromPrerender,
  prerenderedHead,
  type PrerenderedHead,
} from '../prerender/documentPrerender';
import { projectCardsFromList } from '../projects/publishedProjects';
import { fetchPublishedPosts } from '../posts/publishedPosts';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';

export type HomeView = {
  name: string;
  title: string;
  aboutHtml: string;
  head: PrerenderedHead;
};

export type HomeDocument = HomeView & {
  recentPosts: HomeRecentPost[];
  projects: ProjectCardView[];
};

export const publishedHomeUrl = (): string => publishedSiteUrl('/');

/** Rendered from DEFAULT_HOME so the page never blanks before first publish. */
export const fallbackHomeView = (): HomeView => ({
  name: DEFAULT_HOME.name,
  title: DEFAULT_HOME.title,
  aboutHtml: renderHomeAboutHtml(DEFAULT_HOME.about),
  head: { title: `${DEFAULT_HOME.name} - ${DEFAULT_HOME.title}` },
});

const recentPostsFromDocument = (main: Element): HomeRecentPost[] =>
  [...main.querySelectorAll('.home-posts > li.home-post')].flatMap((item) => {
    // Both markups: a cold load can land between a web deploy and the
    // republish that follows it.
    const title = item.querySelector('.ui-card__title, .home-post__title');
    const href = title?.querySelector('a')?.getAttribute('href') ?? '';
    const slug = href.replace(/^\/posts\//, '');
    if (!slug || slug === href) return [];
    return [
      {
        id: item.getAttribute('data-id') || slug,
        slug,
        title: title?.textContent ?? '',
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

  const name = main.getAttribute('data-name') || DEFAULT_HOME.name;
  const title = main.getAttribute('data-title') || DEFAULT_HOME.title;
  return {
    name,
    title,
    aboutHtml: about.innerHTML,
    head: prerenderedHead(root, `${name} - ${title}`),
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

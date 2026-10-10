/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import {
  PROJECTS_PATH,
  postsIndexView,
  projectCardViews,
  type PostProjectLink,
  type PostsIndexItem,
  type ProjectCardView,
  type ProjectPageView,
} from '@gagnechris/shared';
import {
  postArticleView,
  renderHomeAboutHtml,
  renderResumeBodyHtml,
  renderResumeUnavailableBodyHtml,
  type Home,
  type HomeRecentPost,
  type PostArticleFields,
  type ProjectsIndexItem,
  type Resume,
} from '@gagnechris/shared/render';
import type { SiteNavHref } from '@gagnechris/shared/site-chrome';
import { SiteFooter, SiteHeader, SitePage } from './chrome/SiteChrome.js';
import { ContactPageBody } from './pages/ContactPageBody.js';
import { HomeBody } from './home/HomeBody.js';
import { NotFoundBody } from './pages/NotFoundBody.js';
import { PostArticle, PostPageBody } from './posts/PostPageBody.js';
import { PostsIndexBody } from './posts/PostsIndexBody.js';
import { ProjectPageBody } from './projects/ProjectPageBody.js';
import { ProjectsIndexBody } from './projects/ProjectsIndexBody.js';

const thisYear = () => new Date().getFullYear();

// `renderToString`, not static markup: it marks adjacent text nodes, which
// hydration needs to match them one to one.
const page = (
  current: SiteNavHref | null,
  body: ReactNode,
  year: number | string = thisYear(),
): string =>
  renderToString(
    <SitePage current={current} year={year}>
      {body}
    </SitePage>,
  );

export const renderPostPageBodyHtml = (
  post: PostArticleFields,
  partOf: readonly PostProjectLink[] = [],
): string =>
  renderToString(<PostPageBody post={postArticleView(post, partOf)} />);

/** The article alone, for embeds; `headingLevel` fits where it sits. */
export const renderPostArticleHtml = (
  post: PostArticleFields,
  partOf: readonly PostProjectLink[] = [],
  headingLevel: 1 | 2 | 3 | 4 = 1,
): string =>
  renderToString(
    <PostArticle
      post={postArticleView(post, partOf)}
      headingLevel={headingLevel}
    />,
  );

export const renderPostsIndexBodyHtml = (
  posts: readonly PostsIndexItem[],
): string => renderToString(<PostsIndexBody years={postsIndexView(posts)} />);

export const renderProjectsIndexBodyHtml = (
  projects: readonly ProjectsIndexItem[],
): string =>
  renderToString(<ProjectsIndexBody projects={projectCardViews(projects)} />);

export const renderHomeBodyHtml = (
  home: Home,
  recentPosts: readonly HomeRecentPost[] = [],
  projects: readonly ProjectCardView[] = [],
): string =>
  renderToString(
    <HomeBody
      name={home.name}
      title={home.title}
      aboutHtml={renderHomeAboutHtml(home.about)}
      recentPosts={recentPosts}
      projects={projects}
    />,
  );

/**
 * The chrome around a body that is still a string. Elements are adjacent at
 * the seams, so this matches rendering the whole page as one tree.
 */
export const renderSitePageHtml = (
  current: SiteNavHref | null,
  bodyHtml: string,
  year: number | string = thisYear(),
): string =>
  renderToString(<SiteHeader current={current} />) +
  bodyHtml +
  renderToString(<SiteFooter year={year} />);

export const renderNotFoundPageHtml = (year?: number | string): string =>
  page(null, <NotFoundBody />, year);

export const renderContactPageHtml = (year?: number | string): string =>
  page('/contact', <ContactPageBody />, year);

/** The bears pages are lazy chunks: before they load, the page is the chrome alone. */
export const renderBearsShellHtml = (year?: number | string): string =>
  page(null, null, year);

export const renderHomePrerenderHtml = (
  home: Home,
  recentPosts: readonly HomeRecentPost[] = [],
  projects: readonly ProjectCardView[] = [],
  year?: number | string,
): string =>
  renderSitePageHtml(
    null,
    renderHomeBodyHtml(home, recentPosts, projects),
    year,
  );

export const renderProjectsIndexPrerenderHtml = (
  projects: readonly ProjectsIndexItem[],
  year?: number | string,
): string =>
  renderSitePageHtml(
    PROJECTS_PATH,
    renderProjectsIndexBodyHtml(projects),
    year,
  );

export const renderProjectPageBodyHtml = (view: ProjectPageView): string =>
  renderToString(<ProjectPageBody project={view} />);

export const renderProjectPagePrerenderHtml = (
  view: ProjectPageView,
  year?: number | string,
): string =>
  renderSitePageHtml(PROJECTS_PATH, renderProjectPageBodyHtml(view), year);

export const renderResumePrerenderHtml = (
  resume: Resume,
  year?: number | string,
): string => renderSitePageHtml('/resume', renderResumeBodyHtml(resume), year);

export const renderResumeUnavailablePrerenderHtml = (
  year?: number | string,
): string =>
  renderSitePageHtml('/resume', renderResumeUnavailableBodyHtml(), year);

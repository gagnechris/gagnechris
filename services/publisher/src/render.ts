import {
  applyPageMeta,
  escapeHtml,
  homeAboutExcerpt,
  pageTitle,
  projectPageView,
  resumeSummaryExcerpt,
} from '@gagnechris/shared/render';
import {
  PROJECTS_PATH,
  SITE_AUTHOR_NAME,
  projectHasPage,
  siteUrl,
  projectPagePath,
  type PostProjectLink,
  type ProjectBuildLogPost,
  type ProjectCardView,
  type Home,
  type Post,
  type Project,
  type Resume,
} from '@gagnechris/shared';
import type { HomeRecentPost } from '@gagnechris/shared/render';
import {
  renderHomePrerenderHtml,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  renderProjectPagePrerenderHtml,
  renderProjectsIndexPrerenderHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
} from '@gagnechris/public-ui/server';
import { APEX } from './config.js';
import { RESUME_PDF_PUBLIC_PATH } from './resume-pdf.js';

/** `siteUrl('/')` is the bare origin; the sitemap and JSON-LD keep the slash. */
const ROOT_URL = `${siteUrl('/', APEX)}/`;

const absoluteUrl = (pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return siteUrl(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`, APEX);
};

/** An override image as an absolute URL, else the site-wide OG image. */
const ogImage = (override?: string | null): string =>
  absoluteUrl(override || '/og-image.jpg');

const PRERENDER_OPEN = '<!--prerender:start-->';
const PRERENDER_CLOSE = '<!--prerender:end-->';

const ROOT_EMPTY_RE = /<div id="root"><\/div>/i;
const ROOT_PRERENDERED_RE =
  /<div id="root"><!--prerender:start-->[\s\S]*?<!--prerender:end--><\/div>/i;

const injectPrerender = (shellHtml: string, body: string): string => {
  const root = `<div id="root">${PRERENDER_OPEN}${body}${PRERENDER_CLOSE}</div>`;
  return ROOT_PRERENDERED_RE.test(shellHtml)
    ? shellHtml.replace(ROOT_PRERENDERED_RE, () => root)
    : shellHtml.replace(ROOT_EMPTY_RE, () => root);
};

/** The shell with `meta` applied and `body` prerendered into `#root`. */
export const renderShellPage = (
  shellHtml: string,
  meta: Parameters<typeof applyPageMeta>[1],
  body: string,
): string => injectPrerender(applyPageMeta(shellHtml, meta), body);

/** S3 keys stay under `blog/`. */
export const POSTS_PATH = '/posts';

export const postCanonicalUrl = (slug: string): string =>
  siteUrl(`${POSTS_PATH}/${slug}`, APEX);

/**
 * RSS guids keep the `/blog/` URL so feed readers don't re-list every post as
 * new; CloudFront 301s it to the canonical URL.
 */
export const legacyPostUrl = (slug: string): string =>
  siteUrl(`/blog/${slug}`, APEX);

export const resolveOgImage = (post: Post): string =>
  ogImage(post.seo?.ogImage || post.coverImage);

export const buildJsonLd = (post: Post): string => {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    image: resolveOgImage(post),
    mainEntityOfPage: postCanonicalUrl(post.slug),
    author: {
      '@type': 'Person',
      name: SITE_AUTHOR_NAME,
      url: ROOT_URL,
    },
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
};

export const buildArticleHtml = (
  post: Post,
  partOf: readonly PostProjectLink[] = [],
): string => renderSitePageHtml('/posts', renderPostPageBodyHtml(post, partOf));

export const renderPostPage = (
  shellHtml: string,
  post: Post,
  partOf: readonly PostProjectLink[] = [],
): string => {
  const title = escapeHtml(post.seo?.title || pageTitle(post.title));
  const description = escapeHtml(
    post.seo?.description || post.excerpt || post.title,
  );
  const url = postCanonicalUrl(post.slug);
  const image = resolveOgImage(post);
  const article = buildArticleHtml(post, partOf);
  const jsonLd = buildJsonLd(post);

  return renderShellPage(
    shellHtml,
    {
      title,
      description,
      url,
      type: 'article',
      image,
      jsonLd,
      articlePublishedTime: post.publishedAt ?? undefined,
    },
    article,
  );
};

export const renderPostsIndexPage = (
  shellHtml: string,
  posts: Post[],
): string => {
  return renderShellPage(
    shellHtml,
    {
      title: pageTitle('Posts'),
      description: `Posts by ${SITE_AUTHOR_NAME}.`,
      url: siteUrl(POSTS_PATH, APEX),
      type: 'website',
    },
    renderSitePageHtml('/posts', renderPostsIndexBodyHtml(posts)),
  );
};

export const renderResumePage = (shellHtml: string, resume: Resume): string => {
  const title = escapeHtml(resume.seo?.title || pageTitle('Resume'));
  const description = escapeHtml(
    resume.seo?.description || resumeSummaryExcerpt(resume.content.summary),
  );
  return renderShellPage(
    shellHtml,
    {
      title,
      description,
      url: siteUrl('/resume', APEX),
      type: 'website',
      image: ogImage(resume.seo?.ogImage),
    },
    // Always point the SPA download at the publisher-generated PDF.
    renderResumePrerenderHtml({ ...resume, pdfPath: RESUME_PDF_PUBLIC_PATH }),
  );
};

export const renderResumeUnavailablePage = (shellHtml: string): string =>
  renderShellPage(
    shellHtml,
    {
      title: pageTitle('Resume'),
      description: 'Resume available on request.',
      url: siteUrl('/resume', APEX),
      type: 'website',
      image: ogImage(),
    },
    renderResumeUnavailablePrerenderHtml(),
  );

/** `shellHtml` must be the pristine `_shell.html`, never index.html read back. */
export const renderHomePage = (
  shellHtml: string,
  home: Home,
  recentPosts: readonly HomeRecentPost[] = [],
  projects: readonly ProjectCardView[] = [],
): string => {
  const title = escapeHtml(home.seo?.title || `${home.name} - ${home.title}`);
  const description = escapeHtml(
    home.seo?.description || homeAboutExcerpt(home.about),
  );
  return renderShellPage(
    shellHtml,
    {
      title,
      description,
      url: siteUrl('/', APEX),
      type: 'website',
      image: ogImage(home.seo?.ogImage),
    },
    renderHomePrerenderHtml(home, recentPosts, projects),
  );
};

export const projectCanonicalUrl = (slug: string): string =>
  siteUrl(projectPagePath(slug), APEX);

const projectDescription = (project: Project): string =>
  project.pitch || `${project.name}, a project by ${SITE_AUTHOR_NAME}.`;

export const renderProjectsIndexPage = (
  shellHtml: string,
  projects: readonly Project[],
): string =>
  renderShellPage(
    shellHtml,
    {
      title: pageTitle('Projects'),
      description: `What ${SITE_AUTHOR_NAME} is building.`,
      url: siteUrl(PROJECTS_PATH, APEX),
      type: 'website',
    },
    renderProjectsIndexPrerenderHtml(projects),
  );

export const renderProjectPage = (
  shellHtml: string,
  project: Project,
  buildLog: readonly ProjectBuildLogPost[] = [],
): string =>
  renderShellPage(
    shellHtml,
    {
      title: escapeHtml(pageTitle(project.name)),
      description: escapeHtml(projectDescription(project)),
      url: projectCanonicalUrl(project.slug),
      type: 'website',
      image: ogImage(project.previewImage),
    },
    renderProjectPagePrerenderHtml(projectPageView(project, buildLog)),
  );

export type SitemapProjects = {
  projects: readonly Project[];
  /** Corrupt PUBLISHED rows keep their page, so they stay listed. */
  corruptSlugs?: readonly string[];
};

const projectSitemapUrls = ({
  projects,
  corruptSlugs = [],
}: SitemapProjects): { loc: string; lastmod: string | undefined }[] => {
  const paged = projects.filter(projectHasPage);
  const seen = new Set(projects.map((p) => p.slug));
  return [
    ...paged.map((p) => ({
      loc: projectCanonicalUrl(p.slug),
      lastmod: (p.updatedAt || p.publishedAt || '').slice(0, 10) || undefined,
    })),
    ...corruptSlugs
      .filter((slug) => slug && !seen.has(slug))
      .map((slug) => ({ loc: projectCanonicalUrl(slug), lastmod: undefined })),
  ];
};

export const buildSitemapXml = (
  posts: Post[],
  /** Slugs whose PUBLISHED rows are corrupt: HTML is preserved, so they must stay discoverable. */
  extraSlugs: readonly string[] = [],
  projects: SitemapProjects = { projects: [] },
): string => {
  const staticUrls = [
    ROOT_URL,
    ...[POSTS_PATH, PROJECTS_PATH, '/resume', '/contact'].map((path) =>
      siteUrl(path, APEX),
    ),
  ];
  const seen = new Set(posts.map((p) => p.slug));
  const urls = [
    ...staticUrls.map((loc) => ({
      loc,
      lastmod: undefined as string | undefined,
    })),
    ...posts.map((p) => ({
      loc: postCanonicalUrl(p.slug),
      lastmod: (p.updatedAt || p.publishedAt || '').slice(0, 10) || undefined,
    })),
    ...extraSlugs
      .filter((slug) => slug && !seen.has(slug))
      .map((slug) => ({
        loc: postCanonicalUrl(slug),
        lastmod: undefined as string | undefined,
      })),
    ...projectSitemapUrls(projects),
  ];
  const body = urls
    .map((u) => {
      const last = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '';
      return `<url><loc>${u.loc}</loc>${last}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`;
};

export const buildRssXml = (posts: Post[]): string => {
  const items = posts
    .map((p) => {
      const link = postCanonicalUrl(p.slug);
      const pub = p.publishedAt
        ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>`
        : '';
      return `<item><title>${escapeHtml(p.title)}</title><link>${link}</link><guid>${legacyPostUrl(p.slug)}</guid><description>${escapeHtml(p.excerpt || p.title)}</description>${pub}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SITE_AUTHOR_NAME}</title><link>${siteUrl(POSTS_PATH, APEX)}</link><atom:link href="${siteUrl('/rss.xml', APEX)}" rel="self" type="application/rss+xml"/><description>Posts by ${SITE_AUTHOR_NAME}</description>${items}</channel></rss>\n`;
};

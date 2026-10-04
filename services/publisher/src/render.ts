import {
  escapeHtml,
  homeAboutExcerpt,
  renderHomePrerenderHtml,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
  resumeSummaryExcerpt,
} from '@gagnechris/shared/render';
import type { Home, Post, Resume } from '@gagnechris/shared';
import { APEX } from './config.js';
import { applyPageMeta } from './page-meta.js';
import { RESUME_PDF_PUBLIC_PATH } from './resume-pdf.js';

const absoluteUrl = (pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `https://${APEX}${path}`;
};

const defaultOgImage = (): string => absoluteUrl('/og-image.jpg');

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

/** S3 keys stay under `blog/`. */
export const POSTS_PATH = '/posts';

export const postCanonicalUrl = (slug: string): string =>
  `https://${APEX}${POSTS_PATH}/${slug}`;

/**
 * RSS guids keep the `/blog/` URL so feed readers don't re-list every post as
 * new; CloudFront 301s it to the canonical URL.
 */
export const legacyPostUrl = (slug: string): string =>
  `https://${APEX}/blog/${slug}`;

export const resolveOgImage = (post: Post): string => {
  const override = post.seo?.ogImage || post.coverImage;
  return override ? absoluteUrl(override) : defaultOgImage();
};

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
      name: 'Chris Gagne',
      url: `https://${APEX}/`,
    },
  };
  return JSON.stringify(payload).replace(/</g, '\\u003c');
};

export const buildArticleHtml = (post: Post): string =>
  renderSitePageHtml('/posts', renderPostPageBodyHtml(post));

export const renderPostPage = (shellHtml: string, post: Post): string => {
  const title = escapeHtml(post.seo?.title || `${post.title} - Chris Gagne`);
  const description = escapeHtml(
    post.seo?.description || post.excerpt || post.title,
  );
  const url = postCanonicalUrl(post.slug);
  const image = resolveOgImage(post);
  const article = buildArticleHtml(post);
  const jsonLd = buildJsonLd(post);

  let html = applyPageMeta(shellHtml, {
    title,
    description,
    url,
    type: 'article',
    image,
    jsonLd,
    articlePublishedTime: post.publishedAt ?? undefined,
  });
  html = injectPrerender(html, article);

  return html;
};

export const renderPostsIndexPage = (
  shellHtml: string,
  posts: Post[],
): string => {
  const title = 'Posts - Chris Gagne';
  const description = 'Posts by Chris Gagne.';
  const url = `https://${APEX}${POSTS_PATH}`;
  const body = renderSitePageHtml('/posts', renderPostsIndexBodyHtml(posts));

  let html = applyPageMeta(shellHtml, {
    title,
    description,
    url,
    type: 'website',
  });
  html = injectPrerender(html, body);
  return html;
};

export const renderResumePage = (shellHtml: string, resume: Resume): string => {
  const title = escapeHtml(resume.seo?.title || 'Resume - Chris Gagne');
  const description = escapeHtml(
    resume.seo?.description || resumeSummaryExcerpt(resume.content.summary),
  );
  const url = `https://${APEX}/resume`;
  const image = resume.seo?.ogImage
    ? absoluteUrl(resume.seo.ogImage)
    : defaultOgImage();
  // Always point the SPA download at the publisher-generated PDF.
  const body = renderResumePrerenderHtml({
    ...resume,
    pdfPath: RESUME_PDF_PUBLIC_PATH,
  });

  let html = applyPageMeta(shellHtml, {
    title,
    description,
    url,
    type: 'website',
    image,
  });
  html = injectPrerender(html, body);
  return html;
};

export const renderResumeUnavailablePage = (shellHtml: string): string => {
  const title = 'Resume - Chris Gagne';
  const description = 'Resume available on request.';
  const url = `https://${APEX}/resume`;
  const body = renderResumeUnavailablePrerenderHtml();

  let html = applyPageMeta(shellHtml, {
    title,
    description,
    url,
    type: 'website',
    image: defaultOgImage(),
  });
  html = injectPrerender(html, body);
  return html;
};

/** `shellHtml` must be the pristine `_shell.html`, never index.html read back. */
export const renderHomePage = (shellHtml: string, home: Home): string => {
  const title = escapeHtml(home.seo?.title || `${home.name} - ${home.title}`);
  const description = escapeHtml(
    home.seo?.description || homeAboutExcerpt(home.about),
  );
  const url = `https://${APEX}`;
  const image = home.seo?.ogImage
    ? absoluteUrl(home.seo.ogImage)
    : defaultOgImage();

  let html = applyPageMeta(shellHtml, {
    title,
    description,
    url,
    type: 'website',
    image,
  });
  html = injectPrerender(html, renderHomePrerenderHtml(home));
  return html;
};

export const buildSitemapXml = (
  posts: Post[],
  /** Slugs whose PUBLISHED rows are corrupt: HTML is preserved, so they must stay discoverable. */
  extraSlugs: readonly string[] = [],
): string => {
  const staticPaths = ['/', POSTS_PATH, '/resume', '/contact'];
  const seen = new Set(posts.map((p) => p.slug));
  const urls = [
    ...staticPaths.map((path) => ({
      loc: `https://${APEX}${path === '/' ? '/' : path}`,
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
  const self = `https://${APEX}/rss.xml`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Chris Gagne</title><link>https://${APEX}${POSTS_PATH}</link><atom:link href="${self}" rel="self" type="application/rss+xml"/><description>Posts by Chris Gagne</description>${items}</channel></rss>\n`;
};

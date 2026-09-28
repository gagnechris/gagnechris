import {
  escapeHtml,
  homeAboutExcerpt,
  renderHomePrerenderHtml,
  renderMarkdownToHtml,
  renderResumePrerenderHtml,
  replaceMeta,
  resumeSummaryExcerpt,
  upsertCanonical,
  upsertMeta,
} from '@gagnechris/shared/render';
import { formatPostDate, postDateAttribute } from '@gagnechris/shared';
import type { Home, Post, Resume } from '@gagnechris/shared';
import { APEX } from './config.js';
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

/** Put prerendered markup in `#root`, replacing a previous prerender if any. */
const injectPrerender = (shellHtml: string, body: string): string => {
  const root = `<div id="root">${PRERENDER_OPEN}${body}${PRERENDER_CLOSE}</div>`;
  return ROOT_PRERENDERED_RE.test(shellHtml)
    ? shellHtml.replace(ROOT_PRERENDERED_RE, () => root)
    : shellHtml.replace(ROOT_EMPTY_RE, () => root);
};

export const postCanonicalUrl = (slug: string): string =>
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

export const buildArticleHtml = (post: Post): string => {
  const body = renderMarkdownToHtml(post.bodyMarkdown);
  const date = post.publishedAt
    ? `<time datetime="${escapeHtml(postDateAttribute(post.publishedAt))}">${escapeHtml(formatPostDate(post.publishedAt))}</time>`
    : '';
  return `
<article class="blog-post-prerender" data-slug="${escapeHtml(post.slug)}">
  <header>
    <h1>${escapeHtml(post.title)}</h1>
    ${date}
  </header>
  <div class="blog-post-body">${body}</div>
</article>`.trim();
};

/** Inject post meta + prerendered article into the Vite site shell from S3. */
export const renderPostPage = (shellHtml: string, post: Post): string => {
  const title = escapeHtml(post.seo?.title || `${post.title} - Chris Gagne`);
  const description = escapeHtml(
    post.seo?.description || post.excerpt || post.title,
  );
  const url = postCanonicalUrl(post.slug);
  const image = resolveOgImage(post);
  const article = buildArticleHtml(post);
  const jsonLd = buildJsonLd(post);

  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'article');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', image);
  if (post.publishedAt) {
    html = upsertMeta(
      html,
      'property',
      'article:published_time',
      post.publishedAt,
    );
  }
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', image);

  html = upsertCanonical(html, url);
  html = html.replace(
    /<\/head>/i,
    () => `<script type="application/ld+json">${jsonLd}</script></head>`,
  );
  html = injectPrerender(html, article);

  return html;
};

export const renderBlogIndexPage = (
  shellHtml: string,
  posts: Post[],
): string => {
  const title = 'Blog - Chris Gagne';
  const description = 'Posts by Chris Gagne.';
  const url = `https://${APEX}/blog`;
  const list = posts
    .map(
      (p) =>
        `<li><a href="/blog/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`,
    )
    .join('\n');
  const body = `
<section class="blog-index-prerender">
  <h1>Blog</h1>
  <ul>${list || '<li>No published posts yet.</li>'}</ul>
</section>`.trim();

  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = upsertCanonical(html, url);
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

  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', image);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', image);
  html = upsertCanonical(html, url);
  html = injectPrerender(html, body);
  return html;
};

/** Placeholder when the resume singleton is draft / missing (CHR-103). */
export const renderResumeUnavailablePage = (shellHtml: string): string => {
  const title = 'Resume - Chris Gagne';
  const description = 'Resume available on request.';
  const url = `https://${APEX}/resume`;
  const body =
    '<article class="resume-page-unavailable"><header><div class="name-section"><h1>Resume</h1></div></header><main><p>Resume available on request.</p></main></article>';

  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', defaultOgImage());
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', defaultOgImage());
  html = upsertCanonical(html, url);
  html = injectPrerender(html, body);
  return html;
};

/**
 * Home document: publisher writes prerendered markup to `index.html` from the
 * pristine `_shell.html` template (never reads index.html back as the shell).
 */
export const renderHomePage = (shellHtml: string, home: Home): string => {
  const title = escapeHtml(home.seo?.title || `${home.name} - ${home.title}`);
  const description = escapeHtml(
    home.seo?.description || homeAboutExcerpt(home.about),
  );
  const url = `https://${APEX}`;
  const image = home.seo?.ogImage
    ? absoluteUrl(home.seo.ogImage)
    : defaultOgImage();

  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', image);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', image);
  html = upsertCanonical(html, url);
  html = injectPrerender(html, renderHomePrerenderHtml(home));
  return html;
};

export const buildSitemapXml = (posts: Post[]): string => {
  const staticPaths = ['/', '/blog', '/resume', '/contact'];
  const urls = [
    ...staticPaths.map((path) => ({
      loc: `https://${APEX}${path === '/' ? '/' : path}`,
      lastmod: undefined as string | undefined,
    })),
    ...posts.map((p) => ({
      loc: postCanonicalUrl(p.slug),
      lastmod: (p.updatedAt || p.publishedAt || '').slice(0, 10) || undefined,
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
      return `<item><title>${escapeHtml(p.title)}</title><link>${link}</link><guid>${link}</guid><description>${escapeHtml(p.excerpt || p.title)}</description>${pub}</item>`;
    })
    .join('');
  const self = `https://${APEX}/rss.xml`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Chris Gagne</title><link>https://${APEX}/blog</link><atom:link href="${self}" rel="self" type="application/rss+xml"/><description>Posts by Chris Gagne</description>${items}</channel></rss>\n`;
};

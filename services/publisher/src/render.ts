import {
  renderMarkdownToHtml,
  renderResumePrerenderHtml,
  resumeSummaryExcerpt,
} from '@gagnechris/shared';
import type { Post, Resume } from '@gagnechris/shared';
import { APEX } from './config.js';
import { RESUME_PDF_PUBLIC_PATH } from './resume-pdf.js';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const absoluteUrl = (pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `https://${APEX}${path}`;
};

const defaultOgImage = (): string => absoluteUrl('/og-image.jpg');

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
  return JSON.stringify(payload);
};

export const buildArticleHtml = (post: Post): string => {
  const body = renderMarkdownToHtml(post.bodyMarkdown);
  const date = post.publishedAt
    ? `<time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(post.publishedAt.slice(0, 10))}</time>`
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
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
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

  const headExtras = `
    <link rel="canonical" href="${url}" />
    <script type="application/ld+json">${jsonLd}</script>
  `;
  html = html.replace(/<\/head>/i, `${headExtras}</head>`);

  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${article}</div>`,
  );

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
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = html.replace(
    /<\/head>/i,
    `<link rel="canonical" href="${url}" /></head>`,
  );
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${body}</div>`,
  );
  return html;
};

export const renderResumePage = (
  shellHtml: string,
  resume: Resume,
): string => {
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
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
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
  html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${body}</div>`);
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
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Chris Gagne</title><link>https://${APEX}/blog</link><description>Posts by Chris Gagne</description>${items}</channel></rss>\n`;
};

function replaceMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  // Match multi-line <meta> tags from the Vite shell.
  const re = new RegExp(
    `<meta\\s[^>]*?${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
    'i',
  );
  const tag = `<meta ${attr}="${key}" content="${content}" />`;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  return upsertMeta(html, attr, key, content);
}

/** The Vite shell already carries the home canonical — replace, never append. */
function upsertCanonical(html: string, url: string): string {
  const tag = `<link rel="canonical" href="${url}" />`;
  const re = /<link\s[^>]*?rel=["']canonical["'][^>]*>/i;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  return html.replace(/<\/head>/i, `${tag}</head>`);
}

function upsertMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  const tag = `<meta ${attr}="${key}" content="${content}" />`;
  return html.replace(/<\/head>/i, `${tag}\n</head>`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

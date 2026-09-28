/**
 * Build-time HTML meta for static marketing routes (CHR-37 / CHR-95).
 * Uses shared HTML helpers so `$`-safe replace stays in one place (CHR-107).
 */

import {
  escapeHtml,
  escapeRegExp,
  replaceMeta,
  upsertCanonical,
} from '@gagnechris/shared/html';

export type StaticPageMeta = {
  /** URL path without trailing slash; empty string = home. */
  routePath: '' | 'resume' | 'contact' | 'dont-feed-the-bears';
  title: string;
  description: string;
  /** Site-absolute path to OG/Twitter image (defaults to /og-image.jpg). */
  ogImagePath?: string;
};

export const STATIC_PAGE_META: StaticPageMeta[] = [
  {
    routePath: '',
    title: 'Chris Gagne - Engineering Leader',
    description:
      'Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems.',
  },
  {
    routePath: 'resume',
    title: 'Resume - Chris Gagne',
    description:
      'Resume for Chris Gagne — engineering leadership, software delivery, and AI-enabled teams.',
  },
  {
    routePath: 'contact',
    title: 'Contact - Chris Gagne',
    description:
      'Contact Chris Gagne — engineering leadership, software collaboration, and speaking.',
  },
  {
    routePath: 'dont-feed-the-bears',
    title: "Don't Feed the Bears - Chris Gagne",
    description:
      'A short Vermont camp mini-game: secure attractants before black bears reach them, then learn real tips from Vermont Fish & Wildlife.',
    ogImagePath: '/og-dont-feed-the-bears.jpg',
  },
];

const APEX = 'https://gagnechris.com';
const DEFAULT_OG_IMAGE = `${APEX}/og-image.jpg`;

function removeCanonical(html: string): string {
  return html.replace(/<link\s[^>]*?rel=["']canonical["'][^>]*>\s*/i, () => '');
}

function upsertRobotsNoIndex(html: string): string {
  const tag = '<meta name="robots" content="noindex" />';
  const re = /<meta\s[^>]*?name=["']robots["'][^>]*>/i;
  if (re.test(html)) {
    return html.replace(re, () => tag);
  }
  return html.replace(/<\/head>/i, () => `    ${tag}\n</head>`);
}

const ROOT_EMPTY_RE = /<div id="root"><\/div>/i;
const ROOT_PRERENDERED_RE =
  /<div id="root"><!--prerender:start-->[\s\S]*?<!--prerender:end--><\/div>/i;

function injectRoot(html: string, inner: string): string {
  const root = `<div id="root">${inner}</div>`;
  if (ROOT_PRERENDERED_RE.test(html)) {
    return html.replace(ROOT_PRERENDERED_RE, () => root);
  }
  return html.replace(ROOT_EMPTY_RE, () => root);
}

export function canonicalUrlFor(
  routePath: StaticPageMeta['routePath'],
): string {
  return routePath ? `${APEX}/${routePath}` : APEX;
}

function absoluteOgImage(meta: StaticPageMeta): string {
  if (!meta.ogImagePath) return DEFAULT_OG_IMAGE;
  if (meta.ogImagePath.startsWith('http')) return meta.ogImagePath;
  return `${APEX}${meta.ogImagePath.startsWith('/') ? '' : '/'}${meta.ogImagePath}`;
}

/** Apply per-page title, description, OG/Twitter, and canonical to a Vite shell. */
export function applyStaticPageMeta(
  shellHtml: string,
  meta: StaticPageMeta,
): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const url = canonicalUrlFor(meta.routePath);
  const image = absoluteOgImage(meta);

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
  return html;
}

/**
 * Neutral SPA shell for /admin and /auth (CHR-102). Empty #root, noindex,
 * no Home canonical — avoids flashing the Home prerender before React mounts.
 */
export function applySpaShellMeta(shellHtml: string): string {
  const title = 'Chris Gagne';
  const description = 'Chris Gagne — engineering leadership and software.';
  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = replaceMeta(html, 'property', 'og:url', APEX);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = removeCanonical(html);
  html = upsertRobotsNoIndex(html);
  html = injectRoot(html, '');
  return html;
}

/** Static NotFound markup injected into #root for crawlers (CHR-102). */
export const NOT_FOUND_PRERENDER = `<!--prerender:start--><div class="not-found">
  <header>
    <h1>Page not found</h1>
    <a href="/" class="back-link">Back to Home</a>
  </header>
  <main>
    <p>That URL does not match a page on this site.</p>
    <p class="not-found-bear">Lost in the woods? <a href="/dont-feed-the-bears?from=404">Don't feed the bears</a> while you find your way.</p>
    <ul class="not-found-links">
      <li><a href="/">Home</a></li>
      <li><a href="/blog">Blog</a></li>
      <li><a href="/resume">Resume</a></li>
      <li><a href="/contact">Contact</a></li>
    </ul>
  </main>
</div><!--prerender:end-->`;

function removeMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
): string {
  const re = new RegExp(
    `<meta\\s[^>]*?${attr}=["']${escapeRegExp(key)}["'][^>]*>\\s*`,
    'i',
  );
  return html.replace(re, () => '');
}

/**
 * Prerendered /404.html: NotFound markup, noindex, no Home canonical (CHR-102).
 */
export function applyNotFoundPageMeta(shellHtml: string): string {
  const title = 'Page Not Found - Chris Gagne';
  const description = 'That URL does not match a page on this site.';
  let html = shellHtml;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${title}</title>`,
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', 'website');
  html = removeMeta(html, 'property', 'og:url');
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = removeCanonical(html);
  html = upsertRobotsNoIndex(html);
  html = injectRoot(html, NOT_FOUND_PRERENDER);
  return html;
}

export function outputRelativePath(
  routePath: StaticPageMeta['routePath'],
): string {
  return routePath ? `${routePath}/index.html` : 'index.html';
}

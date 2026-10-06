import {
  escapeHtml,
  escapeRegExp,
  replaceMeta,
  upsertCanonical,
} from '@gagnechris/shared/html';
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
  renderContactPrerenderBodyHtml,
  renderNotFoundBodyHtml,
} from '@gagnechris/shared/public-pages';
import { renderSitePageHtml } from '@gagnechris/shared/site-chrome';
import {
  pageTitle,
  SITE_AUTHOR_NAME,
  siteUrl,
} from '@gagnechris/shared/site-config';
import {
  BEARS_PAGE_META,
  type BearsPageMetaEntry,
} from '../src/games/bears/shared/pageMeta.ts';

export type StaticPageMeta = {
  /** URL path without trailing slash; empty string = home. */
  routePath: '' | 'resume' | 'contact' | BearsPageMetaEntry['routePath'];
  title: string;
  description: string;
  ogImagePath?: string;
};

export const STATIC_PAGE_META: StaticPageMeta[] = [
  {
    routePath: '',
    title: `${SITE_AUTHOR_NAME} - Engineering Leader`,
    description:
      'Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems.',
  },
  {
    routePath: 'resume',
    title: pageTitle('Resume'),
    description:
      'Resume for Chris Gagne — engineering leadership, software delivery, and AI-enabled teams.',
  },
  {
    routePath: 'contact',
    title: pageTitle('Contact'),
    description:
      'Contact Chris Gagne — engineering leadership, software collaboration, and speaking.',
  },
  BEARS_PAGE_META.landing,
  BEARS_PAGE_META.camp,
  BEARS_PAGE_META.wild,
];

const DEFAULT_OG_IMAGE = siteUrl('/og-image.jpg');

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
  return siteUrl(`/${routePath}`);
}

function absoluteOgImage(meta: StaticPageMeta): string {
  if (!meta.ogImagePath) return DEFAULT_OG_IMAGE;
  if (meta.ogImagePath.startsWith('http')) return meta.ogImagePath;
  return siteUrl(
    `${meta.ogImagePath.startsWith('/') ? '' : '/'}${meta.ogImagePath}`,
  );
}

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
  const body = staticPagePrerender(meta.routePath);
  if (body) html = injectRoot(html, body);
  return html;
}

const prerender = (html: string): string =>
  `<!--prerender:start-->${html}<!--prerender:end-->`;

/** `src/pages/NotFound.tsx` inside the site chrome. */
export const NOT_FOUND_PRERENDER = prerender(
  renderSitePageHtml(null, renderNotFoundBodyHtml()),
);

/*
 * Home and Resume are prerendered by the publisher. The bears pages are lazy
 * chunks whose fallback renders nothing, so their first React render is the
 * chrome alone, the same as this.
 */
export function staticPagePrerender(
  routePath: StaticPageMeta['routePath'],
): string | null {
  if (routePath === 'contact') {
    return prerender(
      renderSitePageHtml('/contact', renderContactPrerenderBodyHtml()),
    );
  }
  if (routePath.startsWith('dont-feed-the-bears')) {
    return prerender(renderSitePageHtml(null, ''));
  }
  return null;
}

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

export function applyNotFoundPageMeta(shellHtml: string): string {
  const title = NOT_FOUND_TITLE;
  const description = NOT_FOUND_DESCRIPTION;
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

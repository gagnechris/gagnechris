/**
 * Build-time HTML meta for static marketing routes (CHR-37 / CHR-95).
 * Mirrors the publisher's shell replaceMeta approach without a Runtime React render.
 */

export type StaticPageMeta = {
  /** URL path without trailing slash; empty string = home. */
  routePath: '' | 'resume' | 'contact' | 'dont-feed-the-bears'
  title: string
  description: string
  /** Site-absolute path to OG/Twitter image (defaults to /og-image.jpg). */
  ogImagePath?: string
}

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
]

const APEX = 'https://gagnechris.com'
const DEFAULT_OG_IMAGE = `${APEX}/og-image.jpg`

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function replaceMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  const re = new RegExp(
    `<meta\\s[^>]*?${attr}=["']${escapeRegExp(key)}["'][^>]*>`,
    'i',
  )
  const tag = `<meta ${attr}="${key}" content="${content}" />`
  if (re.test(html)) {
    return html.replace(re, tag)
  }
  return html.replace(/<\/head>/i, `${tag}\n</head>`)
}

function upsertCanonical(html: string, url: string): string {
  const tag = `<link rel="canonical" href="${url}" />`
  const re = /<link\s[^>]*?rel=["']canonical["'][^>]*>/i
  if (re.test(html)) {
    return html.replace(re, tag)
  }
  return html.replace(/<\/head>/i, `    ${tag}\n</head>`)
}

export function canonicalUrlFor(routePath: StaticPageMeta['routePath']): string {
  return routePath ? `${APEX}/${routePath}` : APEX
}

function absoluteOgImage(meta: StaticPageMeta): string {
  if (!meta.ogImagePath) return DEFAULT_OG_IMAGE
  if (meta.ogImagePath.startsWith('http')) return meta.ogImagePath
  return `${APEX}${meta.ogImagePath.startsWith('/') ? '' : '/'}${meta.ogImagePath}`
}

/** Apply per-page title, description, OG/Twitter, and canonical to a Vite shell. */
export function applyStaticPageMeta(
  shellHtml: string,
  meta: StaticPageMeta,
): string {
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const url = canonicalUrlFor(meta.routePath)
  const image = absoluteOgImage(meta)

  let html = shellHtml
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  html = replaceMeta(html, 'name', 'description', description)
  html = replaceMeta(html, 'property', 'og:title', title)
  html = replaceMeta(html, 'property', 'og:description', description)
  html = replaceMeta(html, 'property', 'og:type', 'website')
  html = replaceMeta(html, 'property', 'og:url', url)
  html = replaceMeta(html, 'property', 'og:image', image)
  html = replaceMeta(html, 'name', 'twitter:title', title)
  html = replaceMeta(html, 'name', 'twitter:description', description)
  html = replaceMeta(html, 'name', 'twitter:image', image)
  html = upsertCanonical(html, url)
  return html
}

export function outputRelativePath(
  routePath: StaticPageMeta['routePath'],
): string {
  return routePath ? `${routePath}/index.html` : 'index.html'
}

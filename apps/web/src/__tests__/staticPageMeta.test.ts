import { describe, expect, it } from 'vitest'
import {
  STATIC_PAGE_META,
  applyStaticPageMeta,
  canonicalUrlFor,
  outputRelativePath,
} from '../../scripts/staticPageMeta'

const shell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Chris Gagne - Engineering Leader</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="Default" />
    <meta property="og:description" content="Default description" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://gagnechris.com" />
    <meta property="og:image" content="https://gagnechris.com/og-image.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Default" />
    <meta name="twitter:description" content="Default description" />
    <meta name="twitter:image" content="https://gagnechris.com/og-image.jpg" />
  </head>
  <body><div id="root"></div></body>
</html>`

describe('staticPageMeta', () => {
  it('maps routes to output paths', () => {
    expect(outputRelativePath('')).toBe('index.html')
    expect(outputRelativePath('resume')).toBe('resume/index.html')
    expect(outputRelativePath('contact')).toBe('contact/index.html')
  })

  it('applies resume meta without duplicating tags', () => {
    const resume = STATIC_PAGE_META.find((p) => p.routePath === 'resume')!
    const html = applyStaticPageMeta(shell, resume)
    expect(html).toContain('<title>Resume - Chris Gagne</title>')
    expect(html).toContain(
      `content="${resume.description}"`,
    )
    expect(html).toContain(
      `<meta property="og:url" content="${canonicalUrlFor('resume')}" />`,
    )
    expect(html).toContain(
      `<link rel="canonical" href="${canonicalUrlFor('resume')}" />`,
    )
    expect(html.match(/name="description"/g)).toHaveLength(1)
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
  })

  it('covers home, resume, and contact', () => {
    expect(STATIC_PAGE_META.map((p) => p.routePath).sort()).toEqual([
      '',
      'contact',
      'resume',
    ])
  })
})

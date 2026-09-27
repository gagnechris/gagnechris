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
    expect(outputRelativePath('dont-feed-the-bears')).toBe(
      'dont-feed-the-bears/index.html',
    )
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


  it('preserves $$, $&, $`, $\' in titles and meta content', () => {
    const title = "Making $$$ with $$ and $& and $` and $'"
    const description = "echo $$ and $& and $` and $'"
    const escapedTitle = 'Making $$$ with $$ and $&amp; and $` and $\''
    const escapedDescription = 'echo $$ and $&amp; and $` and $\''
    const html = applyStaticPageMeta(shell, {
      routePath: 'contact',
      title,
      description,
    })
    expect(html).toContain(`<title>${escapedTitle}</title>`)
    expect(html).toContain(`content="${escapedTitle}"`)
    expect(html).toContain(`content="${escapedDescription}"`)
  })

  it('covers home, resume, contact, and dont-feed-the-bears', () => {
    expect(STATIC_PAGE_META.map((p) => p.routePath).sort()).toEqual([
      '',
      'contact',
      'dont-feed-the-bears',
      'resume',
    ])
  })

  it('applies bears game meta with dedicated OG image', () => {
    const bears = STATIC_PAGE_META.find(
      (p) => p.routePath === 'dont-feed-the-bears',
    )!
    const html = applyStaticPageMeta(shell, bears)
    expect(html).toContain("<title>Don't Feed the Bears - Chris Gagne</title>")
    expect(html).toContain(
      `<meta property="og:url" content="${canonicalUrlFor('dont-feed-the-bears')}" />`,
    )
    expect(html).toContain(
      'content="https://gagnechris.com/og-dont-feed-the-bears.jpg"',
    )
    expect(html).toContain(
      `<link rel="canonical" href="${canonicalUrlFor('dont-feed-the-bears')}" />`,
    )
  })
})

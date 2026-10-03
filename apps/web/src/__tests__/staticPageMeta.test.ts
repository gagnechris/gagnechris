import { describe, expect, it } from 'vitest';
import {
  STATIC_PAGE_META,
  applyNotFoundPageMeta,
  applyStaticPageMeta,
  canonicalUrlFor,
  outputRelativePath,
} from '../../scripts/staticPageMeta';

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
</html>`;

describe('staticPageMeta', () => {
  it('maps routes to output paths', () => {
    expect(outputRelativePath('')).toBe('index.html');
    expect(outputRelativePath('resume')).toBe('resume/index.html');
    expect(outputRelativePath('contact')).toBe('contact/index.html');
    expect(outputRelativePath('dont-feed-the-bears')).toBe(
      'dont-feed-the-bears/index.html',
    );
    expect(outputRelativePath('dont-feed-the-bears/camp')).toBe(
      'dont-feed-the-bears/camp/index.html',
    );
    expect(outputRelativePath('dont-feed-the-bears/wild')).toBe(
      'dont-feed-the-bears/wild/index.html',
    );
  });

  it('applies resume meta without duplicating tags', () => {
    const resume = STATIC_PAGE_META.find((p) => p.routePath === 'resume')!;
    const html = applyStaticPageMeta(shell, resume);
    expect(html).toContain('<title>Resume - Chris Gagne</title>');
    expect(html).toContain(`content="${resume.description}"`);
    expect(html).toContain(
      `<meta property="og:url" content="${canonicalUrlFor('resume')}" />`,
    );
    expect(html).toContain(
      `<link rel="canonical" href="${canonicalUrlFor('resume')}" />`,
    );
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("preserves $$, $&, $`, $' in titles and meta content", () => {
    const title = "Making $$$ with $$ and $& and $` and $'";
    const description = "echo $$ and $& and $` and $'";
    const escapedTitle = 'Making $$$ with $$ and $&amp; and $` and $&#39;';
    const escapedDescription = 'echo $$ and $&amp; and $` and $&#39;';
    const html = applyStaticPageMeta(shell, {
      routePath: 'contact',
      title,
      description,
    });
    expect(html).toContain(`<title>${escapedTitle}</title>`);
    expect(html).toContain(`content="${escapedTitle}"`);
    expect(html).toContain(`content="${escapedDescription}"`);
  });

  it('covers home, resume, contact, and the bears pages', () => {
    expect(STATIC_PAGE_META.map((p) => p.routePath).sort()).toEqual([
      '',
      'contact',
      'dont-feed-the-bears',
      'dont-feed-the-bears/camp',
      'dont-feed-the-bears/wild',
      'resume',
    ]);
  });

  it('gives each bears game its own canonical URL and title', () => {
    for (const routePath of [
      'dont-feed-the-bears/camp',
      'dont-feed-the-bears/wild',
    ] as const) {
      const meta = STATIC_PAGE_META.find((p) => p.routePath === routePath)!;
      const html = applyStaticPageMeta(shell, meta);
      expect(html).toContain(
        `<link rel="canonical" href="https://gagnechris.com/${routePath}" />`,
      );
      expect(html).toContain(
        'content="https://gagnechris.com/og-dont-feed-the-bears.jpg"',
      );
    }
  });

  it('applies bears game meta with dedicated OG image', () => {
    const bears = STATIC_PAGE_META.find(
      (p) => p.routePath === 'dont-feed-the-bears',
    )!;
    const html = applyStaticPageMeta(shell, bears);
    expect(html).toContain(
      '<title>Don&#39;t Feed the Bears - Chris Gagne</title>',
    );
    expect(html).toContain(
      `<meta property="og:url" content="${canonicalUrlFor('dont-feed-the-bears')}" />`,
    );
    expect(html).toContain(
      'content="https://gagnechris.com/og-dont-feed-the-bears.jpg"',
    );
    expect(html).toContain(
      `<link rel="canonical" href="${canonicalUrlFor('dont-feed-the-bears')}" />`,
    );
  });

  it('builds 404.html with NotFound markup, noindex, and no home canonical', () => {
    const html = applyNotFoundPageMeta(shell);
    expect(html).toContain('<title>Page Not Found - Chris Gagne</title>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('Page not found');
    expect(html).toContain('href="/dont-feed-the-bears?from=404"');
    expect(html).not.toMatch(/rel=["']canonical["']/);
    expect(html).not.toMatch(/property=["']og:url["']/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  STATIC_PAGE_META,
  applyNotFoundPageMeta,
  applySpaShellMeta,
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

  it('covers home, resume, contact, and dont-feed-the-bears', () => {
    expect(STATIC_PAGE_META.map((p) => p.routePath).sort()).toEqual([
      '',
      'contact',
      'dont-feed-the-bears',
      'resume',
    ]);
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

  it('builds spa.html without home canonical and with noindex', () => {
    const html = applySpaShellMeta(shell);
    expect(html).toContain('<title>Notebook</title>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toMatch(/rel=["']canonical["']/);
    expect(html).toContain('<div id="root"></div>');
  });

  it('strips GA from spa.html for the strict admin CSP', () => {
    const withGa = shell.replace(
      '</head>',
      `    <!-- Google Analytics -->
    <script
      async
      src="https://www.googletagmanager.com/gtag/js?id=G-TEST"
    ></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());
      gtag('config', 'G-TEST');
    </script>
  </head>`,
    );
    const html = applySpaShellMeta(withGa);
    expect(html).not.toMatch(/googletagmanager|gtag|Google Analytics/);
    expect(html).not.toMatch(/<script>/);
    expect(applyStaticPageMeta(withGa, STATIC_PAGE_META[0]!)).toContain(
      'googletagmanager',
    );
  });

  it('adds installable PWA tags to spa.html', () => {
    const html = applySpaShellMeta(shell);
    expect(html).toContain('rel="manifest" href="/manifest.json"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('/icons/apple-touch-icon.png');
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
    );
    expect(html).toContain(
      '<meta name="apple-mobile-web-app-title" content="Notebook" />',
    );
    expect(html).toContain('<meta name="theme-color" content="#235a58" />');
    expect(html).toContain(
      '<meta property="og:url" content="https://gagnechris.com/admin/notebook" />',
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

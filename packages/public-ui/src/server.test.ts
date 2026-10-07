import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSTS_INDEX_EMPTY_TEXT } from '@gagnechris/shared';
import { renderPostsIndexBodyHtml } from './server.js';

describe('renderPostsIndexBodyHtml', () => {
  it('renders the title, intro and RSS link', () => {
    expect(renderPostsIndexBodyHtml([])).toContain(
      '<header class="posts-index__header"><h1>Posts</h1>' +
        '<p class="posts-index__intro">Ideas, lessons and experiments from software engineering, leadership and AI.</p>' +
        '<a class="posts-index__rss" href="/rss.xml">Subscribe via RSS</a></header>',
    );
  });

  it('groups posts under year headings, each entry one link with title, short date and excerpt', () => {
    const html = renderPostsIndexBodyHtml([
      {
        id: '01A',
        slug: 'first',
        title: `First & "best" isn't`,
        excerpt: 'An <excerpt>',
        publishedAt: '2025-12-31T23:30:00.000Z',
      },
      {
        id: '01B',
        slug: 'second',
        title: 'Second',
        excerpt: '',
        publishedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(html).toBe(
      '<main class="posts-index blog-index-prerender"><header class="posts-index__header"><h1>Posts</h1>' +
        '<p class="posts-index__intro">Ideas, lessons and experiments from software engineering, leadership and AI.</p>' +
        '<a class="posts-index__rss" href="/rss.xml">Subscribe via RSS</a></header>' +
        '<div class="posts-index__years"><section class="posts-year" aria-labelledby="posts-2026"><h2 class="posts-year__label" id="posts-2026">2026</h2>' +
        '<ul class="posts-year__list"><li class="post-preview" data-id="01B"><a class="post-preview__link" href="/posts/second">' +
        '<h3 class="post-preview__title">Second</h3><time class="post-preview__date" dateTime="2026-02-01">Feb 1</time></a></li></ul></section>' +
        '<section class="posts-year" aria-labelledby="posts-2025"><h2 class="posts-year__label" id="posts-2025">2025</h2>' +
        '<ul class="posts-year__list"><li class="post-preview" data-id="01A"><a class="post-preview__link" href="/posts/first">' +
        '<h3 class="post-preview__title">First &amp; &quot;best&quot; isn&#x27;t</h3><time class="post-preview__date" dateTime="2025-12-31">Dec 31</time>' +
        '<p class="post-preview__excerpt">An &lt;excerpt&gt;</p></a></li></ul></section></div></main>',
    );
  });

  it('says so when nothing is published', () => {
    expect(renderPostsIndexBodyHtml([])).toContain(
      `<div class="posts-index__years"><p class="posts-index__empty">${POSTS_INDEX_EMPTY_TEXT}</p></div></main>`,
    );
  });

  it('is one <main> that holds its <h1>', () => {
    const html = renderPostsIndexBodyHtml([
      {
        id: '1',
        slug: 'hello',
        title: 'Hello',
        excerpt: '',
        publishedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    const count = (tag: string) => html.split(tag).length - 1;
    expect(html).toMatch(/^<main[ >]/);
    expect(html).toMatch(/<\/main>$/);
    expect(count('<main')).toBe(1);
    expect(count('<h1')).toBe(1);
  });
});

// tsx (the local API and e2e stack run the publisher through it) reads one
// tsconfig for every file, so each component file names its JSX runtime.
describe('component files', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : entry.name.endsWith('.tsx')
          ? [join(dir, entry.name)]
          : [],
    );

  it.each(files(import.meta.dirname))('%s sets the JSX runtime', (file) => {
    expect(readFileSync(file, 'utf8')).toMatch(
      /^\/\*\* @jsxRuntime automatic \*\/\n/,
    );
  });
});

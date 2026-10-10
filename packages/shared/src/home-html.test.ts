import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME } from './home-default.js';
import {
  HOME_RECENT_POSTS_LIMIT,
  homeAboutExcerpt,
  renderHomeAboutHtml,
  renderHomeBodyHtml,
  renderHomeRecentPostsHtml,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from './home-html.js';
import { SAMPLE_PROJECTS } from './fixtures/sample-projects.js';
import { selectHomeProjects } from './projects.js';
import type { Home } from './schemas.js';

const home = (overrides: Partial<Home> = {}): Home => ({
  ...DEFAULT_HOME,
  ...overrides,
});

describe('renderHomeAboutHtml', () => {
  it('wraps a single block in one paragraph', () => {
    expect(renderHomeAboutHtml('Just one line.')).toBe('<p>Just one line.</p>');
  });

  it('splits blank-line separated blocks into paragraphs', () => {
    expect(renderHomeAboutHtml('One.\n\nTwo.\n  \nThree.')).toBe(
      '<p>One.</p><p>Two.</p><p>Three.</p>',
    );
  });

  it('keeps single newlines inside a paragraph as breaks', () => {
    expect(renderHomeAboutHtml('One.\nStill one.')).toBe(
      '<p>One.<br />Still one.</p>',
    );
  });

  it('escapes HTML in the body text', () => {
    const html = renderHomeAboutHtml('<script>alert("x")</script> & 5 > 3');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('5 &gt; 3');
  });

  it('renders nothing for empty copy', () => {
    expect(renderHomeAboutHtml('   \n\n  ')).toBe('');
  });
});

const recent = (
  n: number,
  overrides: Partial<HomeRecentPost & { updatedAt: string }> = {},
) => ({
  id: `0${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  excerpt: `Excerpt ${n}.`,
  publishedAt: `2026-0${n}-01T00:00:00.000Z`,
  updatedAt: `2026-0${n}-01T00:00:00.000Z`,
  ...overrides,
});

describe('renderHomeBodyHtml', () => {
  it('is the Home main', () => {
    expect(renderHomeBodyHtml(home())).toMatch(
      /^<main class="home-page home-page-prerender"/,
    );
  });

  it('renders the hero: name, italic title line, About lede, links sentence', () => {
    const html = renderHomeBodyHtml(home());
    expect(html).toContain('<h1 class="home-hero__name">Chris Gagne</h1>');
    expect(html).toContain(
      '<p class="home-hero__title">Engineering Leader</p>',
    );
    expect(html).toContain(
      '<div class="home-hero__about"><p>I&#39;m an Engineering Leader',
    );
    expect(html).toContain(
      '<p class="home-hero__links">Read my <a href="/posts">posts</a>, see <a href="/projects">what I’m building</a>, check out my <a href="/resume">resume</a>, or find me on ' +
        '<a href="https://www.linkedin.com/in/christophergagne/" target="_blank" rel="noopener noreferrer">LinkedIn</a> and ' +
        '<a href="https://github.com/gagnechris" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>',
    );
    expect(html).not.toContain('Quick Links');
  });

  it('exposes name and title as data attributes the SPA reads back', () => {
    const html = renderHomeBodyHtml(home());
    expect(html).toContain('data-name="Chris Gagne"');
    expect(html).toContain('data-title="Engineering Leader"');
  });

  it("preserves $$, $&, $`, $' in prerendered name/title/about", () => {
    const tricky = "Making $$$ with $$ and $& and $` and $'";
    const escaped = 'Making $$$ with $$ and $&amp; and $` and $&#39;';
    const html = renderHomeBodyHtml(
      home({ name: tricky, title: tricky, about: 'echo $$\n\nand $&' }),
    );
    expect(html).toContain(`data-name="${escaped}"`);
    expect(html).toContain(`<h1 class="home-hero__name">${escaped}</h1>`);
    expect(html).toContain('<p>echo $$</p>');
    expect(html).toContain('<p>and $&amp;</p>');
  });

  it('escapes quotes in data attributes', () => {
    const html = renderHomeBodyHtml(home({ name: 'A "B"', title: 'C "D"' }));
    expect(html).toContain('data-name="A &quot;B&quot;"');
    expect(html).toContain('data-title="C &quot;D&quot;"');
  });

  it('has no Recent posts heading when there are no posts', () => {
    const html = renderHomeBodyHtml(home(), []);
    expect(html).not.toContain('Recent posts');
    expect(html).not.toContain('home-section');
  });

  it('puts What I’m building below Recent posts, with an All projects link', () => {
    const html = renderHomeBodyHtml(
      home(),
      [recent(2)],
      selectHomeProjects(SAMPLE_PROJECTS),
    );
    const recentAt = html.indexOf('id="home-recent-posts"');
    const projectsAt = html.indexOf(
      '<h2 class="home-section__label" id="home-projects">What I’m building</h2>' +
        '<a class="home-section__more" href="/projects">All projects</a>',
    );
    expect(recentAt).toBeGreaterThan(-1);
    expect(projectsAt).toBeGreaterThan(recentAt);
    const cards = html
      .slice(projectsAt)
      .match(/<h3 class="project-card__name">[^<]+/g);
    expect(cards).toEqual([
      '<h3 class="project-card__name">Posts',
      '<h3 class="project-card__name">Notebook',
    ]);
  });

  it('has no What I’m building section without projects', () => {
    const html = renderHomeBodyHtml(home(), [recent(2)], []);
    expect(html).not.toContain('home-projects');
  });

  it('lists recent posts with title link, excerpt and UTC date', () => {
    const html = renderHomeBodyHtml(home(), [recent(2)]);
    expect(html).toContain(
      '<h2 class="home-section__label" id="home-recent-posts">Recent posts</h2>' +
        '<a class="home-section__more" href="/posts">All posts</a>',
    );
    expect(html).toContain(
      '<li class="home-post" data-id="02">' +
        '<h3 class="home-post__title"><a href="/posts/post-2">Post 2</a></h3>' +
        '<p class="home-post__excerpt">Excerpt 2.</p>' +
        '<time class="home-post__date" datetime="2026-02-01">February 1, 2026</time></li>',
    );
  });
});

describe('renderHomeRecentPostsHtml', () => {
  it('omits an empty excerpt and a missing date', () => {
    const html = renderHomeRecentPostsHtml([
      recent(1, { excerpt: '', publishedAt: null }),
    ]);
    expect(html).not.toContain('home-post__excerpt');
    expect(html).not.toContain('<time');
  });

  it('escapes titles, excerpts and slugs', () => {
    const html = renderHomeRecentPostsHtml([
      recent(1, { title: '<b>x</b>', excerpt: 'a & b', slug: 'a"b' }),
    ]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('href="/posts/a&quot;b"');
  });
});

describe('selectHomeRecentPosts', () => {
  it('keeps the newest three by publishedAt, then updatedAt', () => {
    const picked = selectHomeRecentPosts([
      recent(1),
      recent(4),
      recent(2),
      recent(3, { publishedAt: null, updatedAt: '2026-04-15T00:00:00.000Z' }),
      recent(5),
    ]);
    expect(picked.map((p) => p.slug)).toEqual(['post-5', 'post-3', 'post-4']);
    expect(picked).toHaveLength(HOME_RECENT_POSTS_LIMIT);
    expect(picked[0]).toEqual({
      id: '05',
      slug: 'post-5',
      title: 'Post 5',
      excerpt: 'Excerpt 5.',
      publishedAt: '2026-05-01T00:00:00.000Z',
    });
  });
});

describe('homeAboutExcerpt', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    expect(homeAboutExcerpt('  one   two  ')).toBe('one two');
    const long = homeAboutExcerpt('word '.repeat(80));
    expect(long.length).toBeLessThanOrEqual(201);
    expect(long.endsWith('…')).toBe(true);
  });
});

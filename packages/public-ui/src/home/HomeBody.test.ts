import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME, projectCardViews, type Home } from '@gagnechris/shared';
import type { HomeRecentPost } from '@gagnechris/shared/render';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { renderHomeBodyHtml } from '../server.js';

const home = (overrides: Partial<Home> = {}): Home => ({
  ...DEFAULT_HOME,
  ...overrides,
});

const recent = (
  n: number,
  overrides: Partial<HomeRecentPost> = {},
): HomeRecentPost => ({
  id: `0${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  excerpt: `Excerpt ${n}.`,
  publishedAt: `2026-0${n}-01T00:00:00.000Z`,
  ...overrides,
});

const cards = projectCardViews(SAMPLE_PROJECTS).slice(0, 2);

describe('HomeBody', () => {
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
  });

  it('is one <main> that holds its <h1>', () => {
    const html = renderHomeBodyHtml(home(), [recent(2)], cards);
    const count = (tag: string) => html.split(tag).length - 1;
    expect(html).toMatch(/<\/main>$/);
    expect(count('<main')).toBe(1);
    expect(count('<h1')).toBe(1);
  });

  it('exposes name and title as data attributes the app reads back', () => {
    const html = renderHomeBodyHtml(home());
    expect(html).toContain('data-name="Chris Gagne"');
    expect(html).toContain('data-title="Engineering Leader"');
  });

  it('escapes the name, title and About copy', () => {
    const html = renderHomeBodyHtml(
      home({ name: 'A "B" & <i>', title: "C 'D'", about: '<b>x</b>' }),
    );
    expect(html).toContain('data-name="A &quot;B&quot; &amp; &lt;i&gt;"');
    expect(html).toContain('data-title="C &#x27;D&#x27;"');
    expect(html).toContain(
      '<h1 class="home-hero__name">A &quot;B&quot; &amp; &lt;i&gt;</h1>',
    );
    expect(html).toContain('<p>&lt;b&gt;x&lt;/b&gt;</p>');
  });

  it('has no sections without posts or projects', () => {
    expect(renderHomeBodyHtml(home())).not.toContain('home-section');
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
        '<time class="home-post__date" dateTime="2026-02-01">February 1, 2026</time></li>',
    );
  });

  it('omits an empty excerpt and a missing date', () => {
    const html = renderHomeBodyHtml(home(), [
      recent(1, { excerpt: '', publishedAt: null }),
    ]);
    expect(html).not.toContain('home-post__excerpt');
    expect(html).not.toContain('<time');
  });

  it('puts What I’m building below Recent posts, with an All projects link and h3 card names', () => {
    const html = renderHomeBodyHtml(home(), [recent(2)], cards);
    const recentAt = html.indexOf('id="home-recent-posts"');
    const projectsAt = html.indexOf(
      '<h2 class="home-section__label" id="home-projects">What I’m building</h2>' +
        '<a class="home-section__more" href="/projects">All projects</a>' +
        '</div><ul class="project-list project-list--home"><li class="project-card"',
    );
    expect(recentAt).toBeGreaterThan(-1);
    expect(projectsAt).toBeGreaterThan(recentAt);
    expect(html.match(/<h3 class="project-card__name">[^<]+/g)).toEqual([
      '<h3 class="project-card__name">Posts',
      '<h3 class="project-card__name">Notebook',
    ]);
  });
});

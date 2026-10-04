import { afterEach, describe, expect, test, vi } from 'vitest';
import { selectHomeProjects } from '@gagnechris/shared';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { renderHomePrerenderHtml } from '@gagnechris/shared/render';
import {
  fallbackHomeView,
  homeDocumentFromRoot,
  loadPublishedHome,
  loadRecentPosts,
  publishedHomeUrl,
} from './publishedHome';

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

const home = {
  name: 'Christopher Gagne',
  title: 'Engineering Director',
  about: 'Published copy.\n\nSecond paragraph.',
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: null,
  version: 2,
  hasUnpublishedChanges: false,
};

const prerender = renderHomePrerenderHtml(home);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('fallbackHomeView', () => {
  test('renders DEFAULT_HOME as paragraph HTML', () => {
    const view = fallbackHomeView();
    expect(view.name).toBe('Chris Gagne');
    expect(view.title).toBe('Engineering Leader');
    expect(view.aboutHtml).toMatch(/^<p>I&#39;m an Engineering Leader at Ro/);
  });
});

describe('homeDocumentFromRoot', () => {
  test('reads name, title, and about body out of the prerender', () => {
    const view = homeDocumentFromRoot(parse(`<body>${prerender}</body>`));
    expect(view).toEqual({
      name: 'Christopher Gagne',
      title: 'Engineering Director',
      aboutHtml: '<p>Published copy.</p><p>Second paragraph.</p>',
      recentPosts: [],
      projects: [],
    });
  });

  test('reads What I’m building back exactly as rendered', () => {
    const projects = selectHomeProjects(SAMPLE_PROJECTS);
    const view = homeDocumentFromRoot(
      parse(`<body>${renderHomePrerenderHtml(home, [], projects)}</body>`),
    );
    expect(projects.map((p) => p.slug)).toEqual(['posts', 'notebook']);
    expect(view?.projects).toEqual(projects);
  });

  test('reads Recent posts back exactly as rendered', () => {
    const recentPosts = [
      {
        id: '02',
        slug: 'second',
        title: 'Second & newest',
        excerpt: 'Has an excerpt.',
        publishedAt: '2026-09-28T09:00:00.000Z',
      },
      {
        id: '01',
        slug: 'first',
        title: 'First',
        excerpt: '',
        publishedAt: null,
      },
    ];
    const view = homeDocumentFromRoot(
      parse(`<body>${renderHomePrerenderHtml(home, recentPosts)}</body>`),
    );
    expect(view?.recentPosts).toEqual([
      { ...recentPosts[0], publishedAt: '2026-09-28' },
      recentPosts[1],
    ]);
  });

  test('returns null for a shell with an empty root', () => {
    expect(
      homeDocumentFromRoot(parse('<body><div id="root"></div></body>')),
    ).toBeNull();
  });

  test('returns null when another page is prerendered', () => {
    const doc = parse(
      '<body><article class="resume-page-prerender"></article></body>',
    );
    expect(homeDocumentFromRoot(doc)).toBeNull();
  });
});

describe('publishedHomeUrl', () => {
  test('is same-origin in prod and proxied locally', () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    expect(publishedHomeUrl()).toBe('/');
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', 'http://127.0.0.1:4177');
    expect(publishedHomeUrl()).toBe('/__site/');
  });
});

describe('loadPublishedHome', () => {
  test('parses the fetched index.html', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          `<!DOCTYPE html><html><body>${prerender}</body></html>`,
      })),
    );
    await expect(loadPublishedHome()).resolves.toMatchObject({
      name: 'Christopher Gagne',
    });
  });

  test('returns null when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(loadPublishedHome()).resolves.toBeNull();
  });
});

describe('loadRecentPosts', () => {
  test('keeps the newest three from posts.json', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    const items = [1, 2, 3, 4].map((n) => ({
      id: `0${n}`,
      slug: `post-${n}`,
      title: `Post ${n}`,
      excerpt: '',
      publishedAt: `2026-0${n}-01T00:00:00.000Z`,
      updatedAt: `2026-0${n}-01T00:00:00.000Z`,
      tags: [],
      coverImage: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ items }) })),
    );
    const posts = await loadRecentPosts();
    expect(posts.map((p) => p.slug)).toEqual(['post-4', 'post-3', 'post-2']);
    expect(fetch).toHaveBeenCalledWith('/posts/posts.json', expect.anything());
  });
});

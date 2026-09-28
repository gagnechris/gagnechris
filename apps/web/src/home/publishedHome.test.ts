import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHomePrerenderHtml } from '@gagnechris/shared/home';
import {
  fallbackHomeView,
  homeViewFromDocument,
  loadPublishedHome,
  publishedHomeUrl,
} from './publishedHome';

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

const prerender = renderHomePrerenderHtml({
  name: 'Christopher Gagne',
  title: 'Engineering Director',
  about: 'Published copy.\n\nSecond paragraph.',
  status: 'published',
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: null,
  version: 2,
  hasUnpublishedChanges: false,
});

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

describe('homeViewFromDocument', () => {
  test('reads name, title, and about body out of the prerender', () => {
    const view = homeViewFromDocument(parse(`<body>${prerender}</body>`));
    expect(view).toEqual({
      name: 'Christopher Gagne',
      title: 'Engineering Director',
      aboutHtml: '<p>Published copy.</p><p>Second paragraph.</p>',
    });
  });

  test('returns null for a shell with an empty root', () => {
    expect(
      homeViewFromDocument(parse('<body><div id="root"></div></body>')),
    ).toBeNull();
  });

  test('returns null when another page is prerendered', () => {
    const doc = parse(
      '<body><article class="resume-page-prerender"></article></body>',
    );
    expect(homeViewFromDocument(doc)).toBeNull();
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

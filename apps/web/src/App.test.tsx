import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_HOME,
  renderHomeBodyHtml,
  type HomeRecentPost,
} from '@gagnechris/shared/render';
import { selectHomeProjects } from '@gagnechris/shared';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { renderHomePrerenderHtml } from '@gagnechris/public-ui/server';
import App from './App';
import { renderWithProviders } from './test-utils';
import * as analytics from './utils/analytics';

vi.mock('./utils/analytics');

const mockTrackEvent = vi.mocked(analytics.trackEvent);

const publishedHome = {
  ...DEFAULT_HOME,
  name: 'Christopher Gagne',
  title: 'Engineering Director',
  about: 'Published about copy.',
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
};

const listItem = (n: number, publishedAt: string) => ({
  id: `0${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  excerpt: n === 2 ? '' : `Excerpt ${n}.`,
  publishedAt,
  updatedAt: publishedAt,
  tags: [],
  coverImage: null,
});

const POSTS = [
  listItem(1, '2026-01-10T00:00:00.000Z'),
  listItem(4, '2026-04-10T00:00:00.000Z'),
  listItem(2, '2026-02-10T00:00:00.000Z'),
  listItem(3, '2026-03-10T00:00:00.000Z'),
];

const RECENT: HomeRecentPost[] = [4, 3, 2].map((n) => {
  const { id, slug, title, excerpt, publishedAt } = POSTS.find(
    (p) => p.id === `0${n}`,
  )!;
  return { id, slug, title, excerpt, publishedAt };
});

const HOME_PROJECTS = selectHomeProjects(SAMPLE_PROJECTS);

/** Routes `/` to a Home prerender (with `projects`) and `/posts/posts.json` to `items`. */
const stubSite = (opts: {
  home?: typeof publishedHome | null;
  items?: unknown[] | null;
  projects?: typeof HOME_PROJECTS;
}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/posts/posts.json') {
        return opts.items
          ? { ok: true, json: async () => ({ items: opts.items }) }
          : { ok: false, status: 404 };
      }
      if (url === '/' && opts.home) {
        return {
          ok: true,
          text: async () =>
            `<!DOCTYPE html><html><body>${renderHomePrerenderHtml(opts.home!, [], opts.projects)}</body></html>`,
        };
      }
      return { ok: false, status: 404 };
    }),
  );

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    stubSite({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('renders the hero and the inline links sentence', () => {
    renderWithProviders(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Chris Gagne' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.home-hero__links')?.textContent).toBe(
      'Read my posts, see what I’m building, check out my resume, or find me on LinkedIn and GitHub.',
    );
    expect(screen.queryByText('Quick Links')).toBeNull();
  });

  test('falls back to DEFAULT_HOME when nothing is published yet', () => {
    renderWithProviders(<App />);

    expect(screen.getByText('Engineering Leader')).toBeInTheDocument();
    expect(
      screen.getByText(
        /I'm an Engineering Leader at Ro with more than 20 years/,
      ),
    ).toBeInTheDocument();
  });

  test('on client navigation loads Home from / and Recent posts from posts.json', async () => {
    stubSite({ home: publishedHome, items: POSTS });

    renderWithProviders(<App />);

    expect(
      await screen.findByText('Published about copy.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Engineering Director')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Recent posts' }),
    ).toBeInTheDocument();
    const titles = [...document.querySelectorAll('.home-post__title a')].map(
      (a) => [a.textContent, a.getAttribute('href')],
    );
    expect(titles).toEqual([
      ['Post 4', '/posts/post-4'],
      ['Post 3', '/posts/post-3'],
      ['Post 2', '/posts/post-2'],
    ]);
    expect(screen.getByText('April 10, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All posts' })).toHaveAttribute(
      'href',
      '/posts',
    );
    expect(fetch).toHaveBeenCalledWith('/posts/posts.json', expect.anything());
  });

  test('on client navigation loads What I’m building from /', async () => {
    stubSite({ home: publishedHome, items: POSTS, projects: HOME_PROJECTS });

    renderWithProviders(<App />);

    const section = await screen.findByRole('region', {
      name: 'What I’m building',
    });
    expect(
      [...section.querySelectorAll('.project-card__link')].map((a) => [
        a.querySelector('.project-card__name')?.textContent,
        a.getAttribute('href'),
      ]),
    ).toEqual([
      ['Posts', '/projects/posts'],
      ['Notebook', '/projects/notebook'],
    ]);
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    // Below Recent posts.
    const sections = [...document.querySelectorAll('.home-section')];
    expect(sections.indexOf(section)).toBe(1);
  });

  test('has no Recent posts heading when there are no posts', async () => {
    stubSite({ home: publishedHome, items: [] });

    renderWithProviders(<App />);

    expect(
      await screen.findByText('Published about copy.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/posts/posts.json',
        expect.anything(),
      ),
    );
    expect(screen.queryByText('Recent posts')).toBeNull();
    expect(document.querySelector('.home-section')).toBeNull();
  });

  test('renders the same markup as the publisher prerender', async () => {
    stubSite({ home: publishedHome, items: POSTS, projects: HOME_PROJECTS });

    const { container } = renderWithProviders(<App />);
    await screen.findByText('Published about copy.');
    await screen.findByText('Post 4');
    await screen.findByText('Notebook');

    const expected = new DOMParser().parseFromString(
      renderHomeBodyHtml(publishedHome, RECENT, HOME_PROJECTS),
      'text/html',
    ).body.firstElementChild!;
    expect(container.querySelector('main.home-page')!.outerHTML).toBe(
      expected.outerHTML,
    );
  });

  test('tracks the hero LinkedIn and GitHub clicks', () => {
    renderWithProviders(<App />);

    fireEvent.click(
      document.querySelector('.home-hero__links a[href*="linkedin"]')!,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'click',
      'external_link',
      'linkedin',
    );

    fireEvent.click(
      document.querySelector('.home-hero__links a[href*="github.com"]')!,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'click',
      'external_link',
      'github',
    );
  });

  test('hero posts, projects and resume links are SPA links', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    for (const [name, href] of [
      ['posts', '/posts'],
      ['what I’m building', '/projects'],
      ['resume', '/resume'],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).not.toHaveAttribute('target');
      expect(link).toHaveAttribute('href', href);
    }

    await user.click(screen.getByRole('link', { name: 'resume' }));
    expect(window.location.pathname).toBe('/resume');
  });

  test('LinkedIn and GitHub open in a new tab', () => {
    renderWithProviders(<App />);

    for (const [name, href] of [
      ['LinkedIn', 'https://www.linkedin.com/in/christophergagne/'],
      ['GitHub', 'https://github.com/gagnechris'],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('leaves the profile photo to the site header', () => {
    const { container } = renderWithProviders(<App />);
    expect(container.querySelector('header.home-hero')).toBeTruthy();
    expect(container.querySelector('.home-page img')).toBeNull();
  });
});

import {
  DEFAULT_RESUME,
  siteResumeJson,
  type SiteHomeJson,
  type SitePostJson,
  type SitePostListItem,
  type SiteResumeJson,
} from '@gagnechris/shared';
import { File } from 'expo-file-system';
import { openBrowserAsync } from 'expo-web-browser';
import { Share } from 'react-native';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Index from '../app/index';
import AccountScreen from '../app/site/account/index';
import SiteHomeScreen from '../app/site/home/index';
import SitePostScreen from '../app/site/posts/[slug]';
import SitePostsScreen from '../app/site/posts/index';
import SiteResumeScreen from '../app/site/resume/index';
import { MarkdownView } from './markdown/MarkdownView';
import { expectAccessible } from '../test/accessible';
import {
  allText,
  byLabel,
  Providers,
  render,
  settle,
  signedOutBackend,
} from '../test/render';
import { router, searchParams, segments } from '../test/router';

vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: Object.assign(
    class {
      constructor(
        public dir: unknown,
        public name: string,
      ) {}
    },
    {
      downloadFileAsync: vi.fn(
        async (_url: string, file: { name: string }) => ({
          uri: `file:///cache/${file.name}`,
        }),
      ),
    },
  ),
}));

const listItem = (
  slug: string,
  publishedAt: string,
  fields: Partial<SitePostListItem> = {},
): SitePostListItem => ({
  id: `id-${slug}`,
  slug,
  title: `Title ${slug}`,
  excerpt: `About ${slug}.`,
  publishedAt,
  updatedAt: publishedAt,
  tags: [],
  coverImage: null,
  ...fields,
});

const HOME: SiteHomeJson = {
  name: 'Chris Gagne',
  title: 'Engineering Leader',
  about: 'First paragraph.\n\nSecond paragraph.',
};

const POSTS = [
  listItem('one', '2025-03-01T00:00:00.000Z'),
  listItem('two', '2026-02-01T00:00:00.000Z'),
  listItem('three', '2026-05-01T00:00:00.000Z'),
  listItem('four', '2026-09-01T00:00:00.000Z'),
];

const POST: SitePostJson = {
  slug: 'four',
  title: 'Title four',
  excerpt: 'About four.',
  publishedAt: '2026-09-01T00:00:00.000Z',
  minutes: 3,
  partOf: [{ name: 'Notebook', href: '/projects/notebook' }],
  bodyMarkdown: 'Hello **world**. See [one](/posts/one).',
};

type Site = Record<string, unknown>;

const siteServer = (site: Site) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === '/api/resume/download') {
      return new Response('{"ok":true}', { status: 200 });
    }
    return path in site
      ? new Response(JSON.stringify(site[path]), { status: 200 })
      : new Response('<Error/>', { status: 403 });
  });

const SITE: Site = {
  '/home/index.json': HOME,
  '/posts/posts.json': { items: POSTS },
  '/posts/four/index.json': POST,
  '/resume/index.json': siteResumeJson(DEFAULT_RESUME),
};

const signedOut = (element: React.ReactElement) =>
  render(<Providers backend={signedOutBackend()}>{element}</Providers>);

describe('Site space', () => {
  let fetch: ReturnType<typeof siteServer>;
  beforeEach(() => {
    fetch = siteServer(SITE);
    vi.stubGlobal('fetch', fetch);
  });
  afterEach(() => vi.clearAllMocks());

  it('a signed-out launch opens Site Home', async () => {
    const renderer = await signedOut(<Index />);
    await settle();
    expect(renderer.root.findByType('Redirect' as never).props.href).toBe(
      '/site/home',
    );
  });

  it('Home shows the published profile and the three newest posts', async () => {
    const renderer = await signedOut(<SiteHomeScreen />);
    await settle();
    const text = allText(renderer);
    expect(text).toContain('Chris Gagne');
    expect(text).toContain('Second paragraph.');
    expect(text).toContain('Title four');
    expect(text).not.toContain('Title one');
    expectAccessible(renderer);

    act(() =>
      byLabel(renderer, 'Title four, September 1, 2026').props.onPress(),
    );
    expect(router.push).toHaveBeenCalledWith('/site/home/four');
    act(() => byLabel(renderer, 'All posts').props.onPress());
    expect(router.navigate).toHaveBeenCalledWith('/site/posts');
  });

  it('Posts lists every post by year, newest first', async () => {
    const renderer = await signedOut(<SitePostsScreen />);
    await settle();
    const text = allText(renderer).split('\n');
    expect(text.filter((line) => /^\d{4}$/.test(line))).toEqual([
      '2026',
      '2025',
    ]);
    expect(text.filter((line) => line.startsWith('Title '))).toEqual([
      'Title four',
      'Title three',
      'Title two',
      'Title one',
    ]);
    expectAccessible(renderer);
  });

  it('a post reads its body, date, reading time and projects', async () => {
    searchParams.current = { slug: 'four' };
    const renderer = await signedOut(<SitePostScreen />);
    await settle();
    const text = allText(renderer);
    expect(text).toContain('Title four');
    expect(text).toContain('September 1, 2026 · 3 min read');
    expect(text).toContain('Part of the Notebook project');
    expect(renderer.root.findAllByProps({ testID: 'md-strong' })).not.toEqual(
      [],
    );
    expectAccessible(renderer);

    act(() => byLabel(renderer, 'Share post').props.onPress());
    expect(Share.share).toHaveBeenCalledWith({
      url: 'https://gagnechris.com/posts/four',
      message: 'Title four',
    });
  });

  it('a linked post opens on the stack the post is on', async () => {
    searchParams.current = { slug: 'four' };
    for (const stack of ['home', 'posts']) {
      segments.current = ['site', stack, '[slug]'];
      const renderer = await signedOut(<SitePostScreen />);
      await settle();
      act(() =>
        renderer.root.findByType(MarkdownView).props.onLinkPress('/posts/one'),
      );
      expect(router.push).toHaveBeenLastCalledWith(`/site/${stack}/one`);
    }
  });

  it('a post that is gone says so', async () => {
    searchParams.current = { slug: 'missing' };
    const renderer = await signedOut(<SitePostScreen />);
    await settle();
    expect(allText(renderer)).toContain('Post not found');
  });

  it('Resume shows its sections and shares the PDF file', async () => {
    const renderer = await signedOut(<SiteResumeScreen />);
    await settle();
    const resume = SITE['/resume/index.json'] as Extract<
      SiteResumeJson,
      { available: true }
    >;
    const text = allText(renderer);
    expect(text).toContain(resume.summary);
    expect(text).toContain(resume.view.labels.experience.toUpperCase());
    expect(text).toContain(resume.view.labels.education.toUpperCase());
    expectAccessible(renderer);

    await act(async () => byLabel(renderer, 'Share PDF').props.onPress());
    await settle();
    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      'https://gagnechris.com/resume.pdf',
      expect.objectContaining({ name: 'Chris-Gagne-Resume.pdf' }),
      { idempotent: true },
    );
    expect(Share.share).toHaveBeenCalledWith({
      url: 'file:///cache/Chris-Gagne-Resume.pdf',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/resume\/download$/),
      expect.objectContaining({ method: 'POST' }),
    );

    await act(async () => byLabel(renderer, 'View PDF').props.onPress());
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://gagnechris.com/resume.pdf',
      expect.anything(),
    );
  });

  it('an unpublished resume says it is available on request', async () => {
    vi.stubGlobal(
      'fetch',
      siteServer({ '/resume/index.json': siteResumeJson(null) }),
    );
    const renderer = await signedOut(<SiteResumeScreen />);
    await settle();
    expect(allText(renderer)).toContain('Resume available on request.');
    expect(() => byLabel(renderer, 'Share PDF')).toThrow();
  });

  it('signed in, the last tab lists the apps with Site current', async () => {
    const renderer = await render(
      <Providers>
        <AccountScreen />
      </Providers>,
    );
    await settle();
    expect(byLabel(renderer, 'Site, current app')).toBeDefined();
    act(() => byLabel(renderer, 'Notebook').props.onPress());
    expect(router.replace).toHaveBeenCalledWith('/today');
  });
});

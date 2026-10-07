import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  type Home,
  type Post,
  type Resume,
} from '@gagnechris/shared';
import { rebuildPublishedSite } from '../src/rebuild.js';
import { createFilesystemSiteStorage } from '../src/storage-fs.js';
import type { SiteStorage } from '../src/storage.js';
import { RESUME_PDF_KEY } from '../src/resume-pdf.js';

const SHELL =
  '<!DOCTYPE html><html><head><title>Shell</title><meta name="description" content="d" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><meta property="og:type" content="website" /><meta property="og:url" content="https://gagnechris.com/" /><meta property="og:image" content="https://gagnechris.com/og-image.jpg" /><meta name="twitter:title" content="t" /><meta name="twitter:description" content="d" /><meta name="twitter:image" content="https://gagnechris.com/og-image.jpg" /><link rel="canonical" href="https://gagnechris.com/" /></head><body><div id="root"></div></body></html>';

const publishedResume = (): Resume => ({
  ...DEFAULT_RESUME,
  name: 'Published Resume',
  status: 'published',
  publishedAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  version: 2,
  content: {
    ...DEFAULT_RESUME.content,
    summary: 'Live resume summary that must survive corruption.',
  },
});

const publishedPost = (): Post => ({
  id: '01CORRUPTPOST0000000000000',
  slug: 'keep-me',
  title: 'Keep Me',
  excerpt: 'ex',
  bodyMarkdown: '# Keep',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});

describe('rebuildPublishedSite corrupt rows', () => {
  let root: string;
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'publisher-corrupt-'));
    await writeFile(join(root, '_shell.html'), SHELL);
    await writeFile(join(root, 'index.html'), SHELL);
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  afterEach(() => {
    if (prevTable === undefined) {
      delete process.env.DATA_TABLE_NAME;
    } else {
      process.env.DATA_TABLE_NAME = prevTable;
    }
  });

  it('corrupt resume row keeps the page and the PDF', async () => {
    const storage = createFilesystemSiteStorage(root);
    const resume = publishedResume();

    await rebuildPublishedSite({
      storage,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'ok', entity: resume }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });

    const liveHtml = await readFile(
      join(root, 'resume', 'index.html'),
      'utf-8',
    );
    expect(liveHtml).toContain('Live resume summary that must survive');
    await access(join(root, RESUME_PDF_KEY));

    const result = await rebuildPublishedSite({
      storage,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'corrupt' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });

    expect(result.resumePublished).toBe(false);
    expect(result.resumeUnpublished).toBe(false);

    const preserved = await readFile(
      join(root, 'resume', 'index.html'),
      'utf-8',
    );
    expect(preserved).toContain('Live resume summary that must survive');
    expect(preserved).not.toContain('resume-page-unavailable');
    await access(join(root, RESUME_PDF_KEY));
  });

  it('corrupt post survives a full rebuild (orphan cleanup skips it)', async () => {
    const storage = createFilesystemSiteStorage(root);
    const post = publishedPost();
    await mkdir(join(root, 'blog', post.slug), { recursive: true });
    await writeFile(
      join(root, 'blog', post.slug, 'index.html'),
      '<html>live post</html>',
    );
    await mkdir(join(root, 'blog', 'gone'), { recursive: true });
    await writeFile(
      join(root, 'blog', 'gone', 'index.html'),
      '<html>orphan</html>',
    );

    const result = await rebuildPublishedSite({
      storage,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({
          posts: [],
          corruptSlugs: [post.slug],
        }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });

    expect(result.removedSlugs).toContain('gone');
    expect(result.removedSlugs).not.toContain(post.slug);
    await access(join(root, 'blog', post.slug, 'index.html'));
    await expect(
      access(join(root, 'blog', 'gone', 'index.html')),
    ).rejects.toThrow();
  });

  it('no-op full rebuild with a published resume puts nothing and invalidates nothing', async () => {
    const fs = createFilesystemSiteStorage(root);
    const puts: string[] = [];
    const deletes: string[] = [];
    const invalidations: string[][] = [];
    // Record only real writes (put/delete return true when bytes changed).
    const storage: SiteStorage = {
      ...fs,
      async put(artifact) {
        const wrote = await fs.put(artifact);
        if (wrote) puts.push(artifact.key);
        return wrote;
      },
      async delete(key) {
        const deleted = await fs.delete(key);
        if (deleted) deletes.push(key);
        return deleted;
      },
      async invalidate(paths) {
        invalidations.push([...paths]);
      },
    };
    const home: Home = {
      ...DEFAULT_HOME,
      status: 'published',
      publishedAt: '2026-09-27T12:00:00.000Z',
      updatedAt: '2026-09-27T12:00:00.000Z',
      version: 1,
      hasUnpublishedChanges: false,
    };
    const post = { ...publishedPost(), slug: 'steady-post' };
    const sources = {
      readGeneration: async () => 0,
      listPublishedPosts: async () => ({ posts: [post], corruptSlugs: [] }),
      listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
      getPublishedResume: async () => ({
        status: 'ok' as const,
        entity: publishedResume(),
      }),
      getPublishedHome: async () => ({ status: 'ok' as const, entity: home }),
    };

    // Real renderResumePdf: pdf-lib stamps "now" unless the dates are pinned.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
      const first = await rebuildPublishedSite({ storage, sources });
      expect(first.resumePublished).toBe(true);
      expect(first.resumePdfFailed).toBe(false);
      expect(puts).toContain(RESUME_PDF_KEY);

      puts.length = 0;
      deletes.length = 0;
      invalidations.length = 0;
      vi.setSystemTime(new Date('2026-10-02T09:30:00.000Z'));
      const second = await rebuildPublishedSite({ storage, sources });

      expect(puts).toEqual([]);
      expect(deletes).toEqual([]);
      expect(second.invalidated).toEqual([]);
      expect(invalidations).toEqual([[]]);
    } finally {
      vi.useRealTimers();
    }
  });
});

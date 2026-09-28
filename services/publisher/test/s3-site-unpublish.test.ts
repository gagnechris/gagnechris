import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  type Home,
  type Resume,
} from '@gagnechris/shared';
import {
  HOME_LAST_PUBLISHED_KEY,
  rebuildPublishedSite,
} from '../src/s3-site.js';
import { createFilesystemSiteStorage } from '../src/storage-fs.js';
import { RESUME_PDF_KEY } from '../src/resume-pdf.js';

const SHELL =
  '<!DOCTYPE html><html><head><title>Shell</title><meta name="description" content="d" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><meta property="og:type" content="website" /><meta property="og:url" content="https://gagnechris.com/" /><meta property="og:image" content="https://gagnechris.com/og-image.jpg" /><meta name="twitter:title" content="t" /><meta name="twitter:description" content="d" /><meta name="twitter:image" content="https://gagnechris.com/og-image.jpg" /><link rel="canonical" href="https://gagnechris.com/" /></head><body><div id="root"></div></body></html>';

const publishedHome = (): Home => ({
  ...DEFAULT_HOME,
  name: 'Published Name',
  title: 'Published Title',
  about: 'Last published about copy that must survive deploys.',
  status: 'published',
  publishedAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  version: 2,
});

const publishedResume = (): Resume => ({
  ...DEFAULT_RESUME,
  name: 'Published Resume',
  status: 'published',
  publishedAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  version: 2,
  content: {
    ...DEFAULT_RESUME.content,
    summary: 'Live resume summary that must not linger after unpublish.',
  },
});

describe('rebuildPublishedSite unpublish cleanup (CHR-103)', () => {
  let root: string;
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'publisher-unpublish-'));
    // Publisher reads pristine _shell.html (CHR-104); index.html is home output.
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

  it('unpublish resume → rebuild deletes PDF and replaces HTML with placeholder', async () => {
    const storage = createFilesystemSiteStorage(root);
    const resume = publishedResume();

    // First publish.
    await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => resume,
        getPublishedHome: async () => undefined,
      },
    });

    const liveHtml = await readFile(
      join(root, 'resume', 'index.html'),
      'utf-8',
    );
    expect(liveHtml).toContain('Live resume summary that must not linger');
    expect(liveHtml).toContain('resume-page-prerender');
    await access(join(root, RESUME_PDF_KEY));

    // Unpublish + rebuild (as after stream / republish-all).
    const result = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => undefined,
        getPublishedHome: async () => undefined,
      },
    });

    expect(result.resumePublished).toBe(false);
    expect(result.resumeUnpublished).toBe(true);

    const placeholder = await readFile(
      join(root, 'resume', 'index.html'),
      'utf-8',
    );
    expect(placeholder).toContain('resume-page-unavailable');
    expect(placeholder).toContain('Resume available on request');
    expect(placeholder).not.toContain(
      'Live resume summary that must not linger',
    );
    await expect(access(join(root, RESUME_PDF_KEY))).rejects.toThrow();
  });

  it('unpublish home → web-deploy shell → rebuild restores last published snapshot', async () => {
    const storage = createFilesystemSiteStorage(root);
    const home = publishedHome();

    const published = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => undefined,
        getPublishedHome: async () => home,
      },
    });
    expect(published.homePublished).toBe(true);
    expect(published.homeRestoredFromSnapshot).toBe(false);

    const afterPublish = await readFile(join(root, 'index.html'), 'utf-8');
    expect(afterPublish).toContain(
      'Last published about copy that must survive',
    );
    expect(afterPublish).toContain('home-page-prerender');

    const snapshotRaw = await readFile(
      join(root, ...HOME_LAST_PUBLISHED_KEY.split('/')),
      'utf-8',
    );
    expect(JSON.parse(snapshotRaw).about).toContain(
      'Last published about copy that must survive',
    );

    // Simulate web deploy: sync overwrites index.html with a fresh empty shell.
    // home/last-published.json is excluded from sync (like blog/resume).
    await writeFile(join(root, 'index.html'), SHELL);
    const afterDeploy = await readFile(join(root, 'index.html'), 'utf-8');
    expect(afterDeploy).not.toContain('home-page-prerender');
    expect(afterDeploy).not.toContain('Last published about copy');

    // Unpublish Home in Dynamo, then republish-all (deploy step 3).
    const restored = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => undefined,
        getPublishedHome: async () => undefined,
      },
    });

    expect(restored.homePublished).toBe(false);
    expect(restored.homeRestoredFromSnapshot).toBe(true);

    const afterRestore = await readFile(join(root, 'index.html'), 'utf-8');
    expect(afterRestore).toContain('home-page-prerender');
    expect(afterRestore).toContain(
      'Last published about copy that must survive',
    );
    expect(afterRestore).toContain('Published Name');
    // Must not be only the empty shell (which would make the SPA use DEFAULT_HOME).
    expect(afterRestore).not.toMatch(/<div id="root"><\/div>/);
  });

  it('never-published home leaves the Vite shell alone (no snapshot yet)', async () => {
    const storage = createFilesystemSiteStorage(root);
    await mkdir(join(root, 'blog'), { recursive: true });

    const result = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => undefined,
        getPublishedHome: async () => undefined,
      },
    });

    expect(result.homePublished).toBe(false);
    expect(result.homeRestoredFromSnapshot).toBe(false);
    expect(await readFile(join(root, 'index.html'), 'utf-8')).toBe(SHELL);
    await expect(
      access(join(root, ...HOME_LAST_PUBLISHED_KEY.split('/'))),
    ).rejects.toThrow();
  });
});

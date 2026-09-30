import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  finalizeInvalidationPaths,
  runPublishTargets,
} from '../src/publish-targets/orchestrator.js';
import {
  getPublishTargets,
  publishTargets,
} from '../src/publish-targets/registry.js';
import type { SiteStorage } from '../src/storage.js';
import { fullRebuildScope } from '../src/rebuild-scope.js';
import nowPageTarget from './fixtures/now-page.target.js';

const targetsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/publish-targets/targets',
);
const registrySource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/publish-targets/registry.ts',
  ),
  'utf8',
);

function memoryStorage(): SiteStorage & {
  puts: string[];
  deletes: string[];
  invalidations: string[][];
} {
  const objects = new Map<string, string | Uint8Array>();
  const puts: string[] = [];
  const deletes: string[] = [];
  const invalidations: string[][] = [];
  return {
    puts,
    deletes,
    invalidations,
    async readShell() {
      return '<html><head></head><body><div id="root"></div></body></html>';
    },
    async read(key) {
      const v = objects.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    async put(key, body) {
      objects.set(key, body);
      puts.push(key);
      return true;
    },
    async delete(key) {
      objects.delete(key);
      deletes.push(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate(paths) {
      invalidations.push(paths);
    },
  };
}

describe('publish target registry', () => {
  it('registers every production *.target.ts module in an explicit array', () => {
    const files = readdirSync(targetsDir).filter((f) =>
      f.endsWith('.target.ts'),
    );
    expect(files).not.toContain('registry-self-test.target.ts');
    const ids = getPublishTargets()
      .map((t) => t.id)
      .sort();
    for (const file of files) {
      const stem = file.replace(/\.target\.ts$/, '');
      expect(registrySource).toContain(`./targets/${stem}.target.js`);
    }
    expect(ids).toEqual(
      ['blog-feeds', 'home', 'post-orphans', 'post-pages', 'resume'].sort(),
    );
    expect(registrySource).not.toContain('definePublishTarget');
    expect(registrySource).not.toContain('registry-self-test');
  });

  it('builds and invalidates a new page from one target file + one registry entry', async () => {
    const storage = memoryStorage();
    // One array entry — no rebuild-scope.ts edits; target owns /now*.
    const targets = [...publishTargets, nowPageTarget];

    const result = await runPublishTargets({
      targets,
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: false,
        home: true,
        resume: false,
      },
      storage,
      sources: {
        listPublishedPosts: async () => [],
        getPublishedResume: async () => undefined,
        getPublishedHome: async () => ({
          name: 'Chris',
          title: 'Engineer',
          about: 'Hi',
          status: 'published',
          publishedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          version: 1,
          hasUnpublishedChanges: false,
          seo: null,
        }),
      },
    });

    expect(storage.puts).toContain('now/index.html');
    expect(result.invalidated).toEqual(
      expect.arrayContaining(['/now*', '/', '/index.html']),
    );
    expect(storage.invalidations[0]).toEqual(
      expect.arrayContaining(['/now*']),
    );
  });
});

describe('finalizeInvalidationPaths', () => {
  it('uses /* for full rebuild when something changed', () => {
    expect(
      finalizeInvalidationPaths(fullRebuildScope(), ['/blog*', '/'], true),
    ).toEqual(['/*']);
  });

  it('returns [] when hash-skip left nothing changed', () => {
    expect(
      finalizeInvalidationPaths(
        {
          allPosts: false,
          postSlugs: new Set(['welcome']),
          slugsToRemove: new Set(),
          feeds: true,
          home: false,
          resume: false,
        },
        ['/blog*'],
        false,
      ),
    ).toEqual([]);
  });

  it('dedupes target-owned paths', () => {
    expect(
      finalizeInvalidationPaths(
        {
          allPosts: false,
          postSlugs: new Set(),
          slugsToRemove: new Set(),
          feeds: false,
          home: true,
          resume: false,
        },
        ['/', '/index.html', '/'],
        true,
      ),
    ).toEqual(['/', '/index.html']);
  });
});

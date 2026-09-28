import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import '../src/publish-targets/bootstrap.js';
import { getPublishTargets } from '../src/publish-targets/registry.js';

const targetsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/publish-targets/targets',
);
const bootstrapSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/publish-targets/bootstrap.ts',
  ),
  'utf8',
);

describe('publish target registry', () => {
  it('registers every production *.target.ts module', () => {
    const files = readdirSync(targetsDir).filter((f) =>
      f.endsWith('.target.ts'),
    );
    const ids = getPublishTargets()
      .map((t) => t.id)
      .sort();
    for (const file of files) {
      const stem = file.replace(/\.target\.ts$/, '');
      expect(bootstrapSource).toContain(`./targets/${stem}.target.js`);
    }
    expect(ids).toEqual(
      [
        'blog-feeds',
        'home',
        'post-orphans',
        'post-pages',
        'registry-self-test',
        'resume',
      ].sort(),
    );
  });

  it('registers a demo target from a single new *.target.ts file', async () => {
    const before = getPublishTargets().length;
    await import('./fixtures/ac-demo-publish.target.js');
    const demo = getPublishTargets().find((t) => t.id === 'ac-demo-publish');
    expect(demo).toBeDefined();
    expect(
      demo!.matches({
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: false,
        home: true,
        resume: false,
      }),
    ).toBe(true);
    expect(getPublishTargets().length).toBe(before + 1);
  });
});

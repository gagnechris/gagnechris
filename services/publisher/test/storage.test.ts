import { describe, expect, it } from 'vitest';
import { access, mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesystemSiteStorage } from '../src/storage-fs.js';
import { postSlugsFromKeys, SITE_SHELL_KEY } from '../src/storage.js';

describe('postSlugsFromKeys', () => {
  it('extracts post slugs and skips blog index / posts.json', () => {
    expect(
      postSlugsFromKeys([
        'blog/index.html',
        'blog/posts.json',
        'blog/hello/index.html',
        'blog/world/index.html',
      ]).sort(),
    ).toEqual(['hello', 'world']);
  });
});

describe('filesystem site storage', () => {
  it('lists keys and deletes orphaned post pages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await mkdir(join(root, 'blog', 'orphan'), { recursive: true });
    await writeFile(
      join(root, 'index.html'),
      '<html><body><div id="root"></div></body></html>',
    );
    await writeFile(
      join(root, 'blog', 'orphan', 'index.html'),
      '<html>old</html>',
    );
    await writeFile(join(root, 'blog', 'index.html'), '<html>index</html>');
    await writeFile(join(root, 'blog', 'posts.json'), '{}');

    const storage = createFilesystemSiteStorage(root);
    const keys = await storage.list('blog/');
    expect(postSlugsFromKeys(keys)).toEqual(['orphan']);
    expect(keys).toContain('blog/index.html');
    expect(keys).toContain('blog/posts.json');

    for (const slug of postSlugsFromKeys(keys)) {
      await storage.delete(`blog/${slug}/index.html`);
    }
    await expect(
      access(join(root, 'blog', 'orphan', 'index.html')),
    ).rejects.toThrow();
    await access(join(root, 'blog', 'index.html'));
  });

  it('reads shell and puts blog artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await writeFile(join(root, SITE_SHELL_KEY), '<html>shell</html>');
    const storage = createFilesystemSiteStorage(root);
    expect(await storage.readShell()).toBe('<html>shell</html>');
    const wrote = await storage.put(
      'blog/hello/index.html',
      '<html>post</html>',
      'text/html',
      'no-cache',
    );
    expect(wrote).toBe(true);
    expect(await storage.list('blog/')).toEqual(['blog/hello/index.html']);
    await storage.invalidate(['/blog/hello']);
  });

  it('does not treat index.html as the shell template', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await writeFile(join(root, SITE_SHELL_KEY), '<html>pristine</html>');
    await writeFile(join(root, 'index.html'), '<html>home-prerender</html>');
    const storage = createFilesystemSiteStorage(root);
    expect(await storage.readShell()).toBe('<html>pristine</html>');
  });

  it('skips put when bytes are unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await writeFile(join(root, SITE_SHELL_KEY), '<html>shell</html>');
    const storage = createFilesystemSiteStorage(root);
    expect(
      await storage.put(
        'blog/a/index.html',
        '<html>a</html>',
        'text/html',
        'x',
      ),
    ).toBe(true);
    expect(
      await storage.put(
        'blog/a/index.html',
        '<html>a</html>',
        'text/html',
        'x',
      ),
    ).toBe(false);
    expect(await readFile(join(root, 'blog', 'a', 'index.html'), 'utf8')).toBe(
      '<html>a</html>',
    );
  });
});

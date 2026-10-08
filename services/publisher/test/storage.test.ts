import { describe, expect, it } from 'vitest';
import { access, mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readObjectMeta } from '../src/fs-object-meta.js';
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
    const wrote = await storage.put({
      key: 'blog/hello/index.html',
      body: '<html>post</html>',
      contentType: 'text/html',
      cacheControl: 'no-cache',
    });
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

  it('delete returns false when the key is already absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await writeFile(join(root, SITE_SHELL_KEY), '<html>shell</html>');
    const storage = createFilesystemSiteStorage(root);
    expect(await storage.delete('resume.pdf')).toBe(false);
    await storage.put({
      key: 'resume.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
      cacheControl: '',
    });
    expect(await storage.delete('resume.pdf')).toBe(true);
    expect(await storage.delete('resume.pdf')).toBe(false);
  });

  it('keeps each object’s Content-Type and Content-Disposition out of the listing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    const storage = createFilesystemSiteStorage(root);
    const pdf = {
      key: 'resume.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="r.pdf"',
      cacheControl: '',
    };
    expect(await storage.put(pdf)).toBe(true);
    expect(await readObjectMeta(root, 'resume.pdf')).toEqual({
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="r.pdf"',
    });
    expect(await storage.list('')).toEqual(['resume.pdf']);

    expect(await storage.put({ ...pdf, contentDisposition: undefined })).toBe(
      true,
    );
    expect(await readObjectMeta(root, 'resume.pdf')).toEqual({
      contentType: 'application/pdf',
    });

    await storage.delete('resume.pdf');
    expect(await readObjectMeta(root, 'resume.pdf')).toBeUndefined();
  });

  it('skips put when bytes are unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    await writeFile(join(root, SITE_SHELL_KEY), '<html>shell</html>');
    const storage = createFilesystemSiteStorage(root);
    expect(
      await storage.put({
        key: 'blog/a/index.html',
        body: '<html>a</html>',
        contentType: 'text/html',
        cacheControl: 'x',
      }),
    ).toBe(true);
    expect(
      await storage.put({
        key: 'blog/a/index.html',
        body: '<html>a</html>',
        contentType: 'text/html',
        cacheControl: 'x',
      }),
    ).toBe(false);
    expect(await readFile(join(root, 'blog', 'a', 'index.html'), 'utf8')).toBe(
      '<html>a</html>',
    );
  });

  it('a read during a put sees the old or the new file, never a partial one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-fs-'));
    const storage = createFilesystemSiteStorage(root);
    const key = 'posts/index.html';
    const versions = ['a', 'b', 'c', 'd'].map((c) => c.repeat(4 * 1024 * 1024));
    await storage.put({
      key: key,
      body: versions[0]!,
      contentType: 'text/html',
      cacheControl: 'x',
    });

    const seen = new Set<number | undefined>();
    let writing = true;
    const reader = (async () => {
      while (writing) {
        const body = await storage.read(key);
        seen.add(body === undefined ? undefined : versions.indexOf(body));
      }
    })();
    for (const body of versions.slice(1)) {
      await storage.put({
        key: key,
        body: body,
        contentType: 'text/html',
        cacheControl: 'x',
      });
    }
    writing = false;
    await reader;

    expect(seen.has(-1)).toBe(false);
    expect(seen.has(undefined)).toBe(false);
    expect(await storage.list('posts/')).toEqual([key]);
  });
});

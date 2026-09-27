import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requireEnv } from './config.js';
import type { SiteStorage } from './storage.js';

async function walkFiles(root: string, prefix: string): Promise<string[]> {
  const abs = join(root, prefix);
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(root, `${rel}/`)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

export function createFilesystemSiteStorage(
  rootDir?: string,
): SiteStorage {
  const root = rootDir ?? requireEnv('SITE_BUCKET_NAME');

  return {
    async readShell(): Promise<string> {
      const body = await readFile(join(root, 'index.html'), 'utf-8');
      if (!body.trim()) {
        throw new Error('Site shell index.html is empty or missing');
      }
      return body;
    },

    async put(
      key: string,
      body: string | Uint8Array,
      _contentType: string,
      _cacheControl: string,
    ): Promise<void> {
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      if (typeof body === 'string') {
        await writeFile(path, body, 'utf-8');
      } else {
        await writeFile(path, body);
      }
    },

    async delete(key: string): Promise<void> {
      await rm(join(root, key), { force: true });
    },

    async list(prefix: string): Promise<string[]> {
      return walkFiles(root, prefix);
    },

    async invalidate(_paths: string[]): Promise<void> {
      // Local / filesystem: nothing to invalidate.
    },
  };
}

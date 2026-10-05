import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requireEnv } from './config.js';
import { SITE_SHELL_KEY, type SiteStorage } from './storage.js';

const TMP_SUFFIX = '.publisher-tmp';

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
    } else if (entry.isFile() && !entry.name.endsWith(TMP_SUFFIX)) {
      out.push(rel);
    }
  }
  return out;
}

function bodyBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === 'string' ? Buffer.from(body, 'utf-8') : body;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return Buffer.compare(a, b) === 0;
}

export function createFilesystemSiteStorage(rootDir?: string): SiteStorage {
  const root = rootDir ?? requireEnv('SITE_BUCKET_NAME');

  return {
    async readShell(): Promise<string> {
      const body = await readFile(join(root, SITE_SHELL_KEY), 'utf-8');
      if (!body.trim()) {
        throw new Error(`Site shell ${SITE_SHELL_KEY} is empty or missing`);
      }
      return body;
    },

    async read(key: string): Promise<string | undefined> {
      try {
        return await readFile(join(root, key), 'utf-8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw err;
      }
    },

    async put(
      key: string,
      body: string | Uint8Array,
      _contentType: string,
      _cacheControl: string,
      _contentDisposition?: string,
    ): Promise<boolean> {
      const path = join(root, key);
      const next = bodyBytes(body);
      try {
        const existing = await readFile(path);
        if (sameBytes(existing, next)) {
          return false;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      await mkdir(dirname(path), { recursive: true });
      // writeFile truncates in place, so the local site would serve a
      // concurrent request an empty or half-written page. S3 PUTs are atomic.
      const tmp = `${path}.${randomUUID()}${TMP_SUFFIX}`;
      try {
        await writeFile(tmp, next);
        await rename(tmp, path);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      return true;
    },

    async delete(key: string): Promise<boolean> {
      const path = join(root, key);
      try {
        await access(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw err;
      }
      await rm(path, { force: true });
      return true;
    },

    async list(prefix: string): Promise<string[]> {
      return walkFiles(root, prefix);
    },

    async invalidate(_paths: string[]): Promise<void> {
      // Local / filesystem: nothing to invalidate.
    },
  };
}

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
import {
  deleteObjectMeta,
  OBJECT_META_DIR,
  readObjectMeta,
  writeObjectMeta,
} from './fs-object-meta.js';
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
      if (rel === OBJECT_META_DIR) continue;
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

    async put({
      key,
      body,
      contentType,
      contentDisposition,
    }): Promise<boolean> {
      const path = join(root, key);
      const next = bodyBytes(body);
      const meta = await readObjectMeta(root, key);
      const sameMeta =
        meta?.contentType === contentType &&
        meta.contentDisposition === contentDisposition;
      if (!sameMeta) {
        await writeObjectMeta(root, key, { contentType, contentDisposition });
      }
      try {
        const existing = await readFile(path);
        if (sameBytes(existing, next) && sameMeta) {
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
      await deleteObjectMeta(root, key);
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

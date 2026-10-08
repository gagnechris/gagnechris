import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * S3 keeps each object's Content-Type and Content-Disposition; a plain file
 * can't, so the filesystem bucket keeps them here for the local site server.
 */
export const OBJECT_META_DIR = '.object-meta';

export type ObjectMeta = { contentType: string; contentDisposition?: string };

const metaPath = (root: string, key: string) =>
  join(root, OBJECT_META_DIR, `${key}.json`);

export async function readObjectMeta(
  root: string,
  key: string,
): Promise<ObjectMeta | undefined> {
  try {
    return JSON.parse(
      await readFile(metaPath(root, key), 'utf-8'),
    ) as ObjectMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

export async function writeObjectMeta(
  root: string,
  key: string,
  meta: ObjectMeta,
): Promise<void> {
  const path = metaPath(root, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(meta));
}

export async function deleteObjectMeta(
  root: string,
  key: string,
): Promise<void> {
  await rm(metaPath(root, key), { force: true });
}

import {
  MARKDOWN_IMAGE,
  MEDIA_CONTENT_TYPES,
  notebookImageName,
  type MediaContentType,
} from '@gagnechris/shared';
import type { ApiClient } from '@gagnechris/api-client';
import type { ResolveImageSrc } from '../kit/markdown/imageWidgets';

const allowed = new Set<string>(MEDIA_CONTENT_TYPES);

/** A signed URL this close to expiry is fetched again rather than reused. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/** Uploads to the caller's private Notebook media; returns each image's markdown `src`. */
export async function uploadNotebookImages(
  client: ApiClient,
  files: File[],
): Promise<string[]> {
  const srcs: string[] = [];
  for (const file of files) {
    if (!allowed.has(file.type)) {
      throw new Error(`Unsupported image type: ${file.type || file.name}`);
    }
    const { data, error, response } = await client.POST(
      '/api/notebook/images/upload-url',
      {
        body: {
          contentType: file.type as MediaContentType,
          contentLength: file.size,
        },
      },
    );
    if (error || !data) {
      throw new Error(
        `Image upload rejected (${response.status}): ${file.name || file.type}`,
      );
    }
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: data.headers,
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Image upload failed (${put.status})`);
    }
    srcs.push(data.src);
  }
  return srcs;
}

/**
 * `<img>` can't send the bearer token, so a Notebook image loads through a
 * short-lived URL the API signs. Each name's URL is shared until near expiry.
 */
export function notebookImageResolver(
  getClient: () => ApiClient,
  now: () => number = Date.now,
): ResolveImageSrc {
  const cache = new Map<string, { url: Promise<string>; expires: number }>();
  return (src) => {
    const name = notebookImageName(src);
    if (!name) return src;
    const hit = cache.get(name);
    if (hit && hit.expires - EXPIRY_MARGIN_MS > now()) return hit.url;
    const entry = { url: Promise.resolve(''), expires: Infinity };
    entry.url = getClient()
      .GET('/api/notebook/images/{name}', { params: { path: { name } } })
      .then(({ data, response }) => {
        if (!data) throw new Error(`Image not loaded (${response.status})`);
        entry.expires = Date.parse(data.expiresAt);
        return data.url;
      })
      .catch((err: unknown) => {
        cache.delete(name);
        throw err;
      });
    cache.set(name, entry);
    return entry.url;
  };
}

/** The Notebook images a note or task description shows. */
export function notebookImageNames(markdown: string): string[] {
  const names = new Set<string>();
  for (const m of markdown.matchAll(MARKDOWN_IMAGE)) {
    const name = notebookImageName(m[2]!);
    if (name) names.add(name);
  }
  return [...names];
}

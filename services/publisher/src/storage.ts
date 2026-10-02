/**
 * Pristine Vite SPA shell key. Deploy uploads this; the publisher reads it and
 * never treats its own `index.html` (home prerender) as the template (CHR-104).
 */
export const SITE_SHELL_KEY = '_shell.html';

/**
 * Site artifact storage for the publisher (S3 in prod, filesystem locally).
 */
export type SiteStorage = {
  readShell(): Promise<string>;
  /** Returns undefined when the key is missing. */
  read(key: string): Promise<string | undefined>;
  /**
   * Write an object. Returns `true` when the object body changed (or was new),
   * `false` when skipped because content already matched (hash / byte compare).
   */
  put(
    key: string,
    body: string | Uint8Array,
    contentType: string,
    cacheControl: string,
    contentDisposition?: string,
  ): Promise<boolean>;
  /**
   * Delete an object. Returns `true` when an object was removed, `false` when
   * the key was already absent (CHR-167: idempotent deletes must not count as
   * changes that force CloudFront invalidation).
   */
  delete(key: string): Promise<boolean>;
  /** Object keys under prefix (no leading slash). */
  list(prefix: string): Promise<string[]>;
  invalidate(paths: string[]): Promise<void>;
};

/** Slugs that have `blog/<slug>/index.html` (excludes blog/index.html). */
export function postSlugsFromKeys(keys: string[]): string[] {
  const slugs: string[] = [];
  for (const key of keys) {
    const match = /^blog\/([^/]+)\/index\.html$/.exec(key);
    if (match?.[1] && match[1] !== 'index') {
      slugs.push(match[1]);
    }
  }
  return slugs;
}

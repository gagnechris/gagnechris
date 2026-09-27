/**
 * Site artifact storage for the publisher (S3 in prod, filesystem locally).
 */
export type SiteStorage = {
  readShell(): Promise<string>;
  put(
    key: string,
    body: string,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
  delete(key: string): Promise<void>;
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

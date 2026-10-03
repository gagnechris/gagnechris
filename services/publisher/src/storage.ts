/** The publisher never treats its own `index.html` (home prerender) as the template. */
export const SITE_SHELL_KEY = '_shell.html';

export type SiteStorage = {
  readShell(): Promise<string>;
  read(key: string): Promise<string | undefined>;
  /** `false` when skipped because content already matched. */
  put(
    key: string,
    body: string | Uint8Array,
    contentType: string,
    cacheControl: string,
    contentDisposition?: string,
  ): Promise<boolean>;
  /** `false` when already absent: idempotent deletes must not force a CloudFront invalidation. */
  delete(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  invalidate(paths: string[]): Promise<void>;
};

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

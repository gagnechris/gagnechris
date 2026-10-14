import { renderRedirectPage } from '../render.js';
import type { PublishArtifact } from '../storage.js';
import { CACHE_HTML } from './types.js';

export const htmlArtifact = (key: string, body: string): PublishArtifact => ({
  key,
  body,
  contentType: 'text/html; charset=utf-8',
  cacheControl: CACHE_HTML,
});

export const jsonArtifact = (key: string, value: unknown): PublishArtifact => ({
  key,
  body: JSON.stringify(value),
  contentType: 'application/json; charset=utf-8',
  cacheControl: CACHE_HTML,
});

/**
 * The page left at a renamed post's or project's old URL. The object's
 * redirect location makes the edge answer with a 301; the page itself only
 * shows where a 301 can't (the local site before the function ran, crawlers
 * reading the canonical link).
 */
export const redirectArtifact = (
  key: string,
  path: string,
  canonicalUrl: string,
): PublishArtifact => ({
  ...htmlArtifact(key, renderRedirectPage(canonicalUrl)),
  redirectLocation: path,
});

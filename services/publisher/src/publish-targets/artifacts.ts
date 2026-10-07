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

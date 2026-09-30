import { afterEach, describe, expect, it } from 'vitest';
import {
  MediaUploadUrlRequestSchema,
  MEDIA_MAX_BYTES,
} from '@gagnechris/shared';
import {
  buildMediaObjectKey,
  createMediaUploadUrl,
  setS3Client,
} from '../src/media/storage.js';
import { mediaRoutes } from '../src/media/handlers.js';
import { dispatchRoutes } from '../src/router.js';
import { makeEvent } from './support/make-event.js';

describe('media upload', () => {
  afterEach(() => {
    setS3Client(undefined);
    delete process.env.SITE_STORAGE;
    delete process.env.SITE_BUCKET_NAME;
    delete process.env.VITE_LOCAL_API_ORIGIN;
  });

  it('builds media keys under media/yyyy/mm/', () => {
    const key = buildMediaObjectKey(
      'image/png',
      'shot.PNG',
      new Date('2026-09-27T12:00:00.000Z'),
    );
    expect(key).toMatch(/^media\/2026\/09\/[a-f0-9]{16}\.png$/);
  });

  it('rejects non-image content types in the schema', () => {
    const result = MediaUploadUrlRequestSchema.safeParse({
      contentType: 'application/pdf',
      contentLength: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects oversized contentLength in the schema', () => {
    const result = MediaUploadUrlRequestSchema.safeParse({
      contentType: 'image/jpeg',
      contentLength: MEDIA_MAX_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('returns a local PUT URL when SITE_STORAGE=filesystem', async () => {
    process.env.SITE_STORAGE = 'filesystem';
    process.env.SITE_BUCKET_NAME = '/tmp/local-site';
    process.env.VITE_LOCAL_API_ORIGIN = 'http://127.0.0.1:8787';
    const result = await createMediaUploadUrl({
      contentType: 'image/webp',
      contentLength: 42,
      filename: 'pic.webp',
    });
    expect(result.publicPath).toMatch(
      /^\/media\/\d{4}\/\d{2}\/[a-f0-9]+\.webp$/,
    );
    expect(result.uploadUrl).toContain('/api/admin/media/objects/');
    expect(result.headers['Content-Type']).toBe('image/webp');
    expect(result.publicPath.endsWith('.webp')).toBe(true);
  });

  it('rejects invalid body with 400', async () => {
    const res = await dispatchRoutes(
      mediaRoutes,
      makeEvent('POST', '/api/admin/media/upload-url', {
        jwtClaims: { sub: 'admin-1' },
        body: { contentType: 'text/plain', contentLength: 1 },
      }),
      'POST',
      '/api/admin/media/upload-url',
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-media paths on the media table', async () => {
    const res = await dispatchRoutes(
      mediaRoutes,
      makeEvent('GET', '/api/admin/posts', { jwtClaims: { sub: 'admin-1' } }),
      'GET',
      '/api/admin/posts',
    );
    expect(res.statusCode).toBe(404);
  });
});

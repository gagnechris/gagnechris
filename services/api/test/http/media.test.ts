import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { siteAdmin } from './support/claims.js';
import { useApi, type Harness } from './support/harness.js';

const root = mkdtempSync(join(tmpdir(), 'media-root-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const ORIGIN = 'http://media.test:1234';

const local = useApi('media-local', {
  env: {
    SITE_STORAGE: 'filesystem',
    SITE_BUCKET_NAME: root,
    VITE_LOCAL_API_ORIGIN: `${ORIGIN}/`,
  },
});
const s3 = useApi('media-s3', {
  env: { SITE_STORAGE: 's3', SITE_BUCKET_NAME: 'gagnechris-it-media' },
});

const uploadUrl = (h: Harness, body: unknown) =>
  h.api.request('POST', '/api/admin/media/upload-url', {
    body,
    claims: siteAdmin(),
  });

function month(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('POST /api/admin/media/upload-url', () => {
  it.each([
    ['image/png', undefined, 'png'],
    ['image/jpeg', ' Photo.JPEG ', 'jpg'],
    ['image/png', 'shot.webp', 'webp'],
    ['image/gif', 'notes.txt', 'gif'],
    ['image/webp', 'no-extension', 'webp'],
  ])('names a %s (%s) upload .%s', async (contentType, filename, ext) => {
    const before = Date.now();
    const res = await uploadUrl(local, {
      contentType,
      contentLength: 10,
      ...(filename ? { filename } : {}),
    });
    expect(res.status).toBe(200);
    const key = res.body.publicPath.slice(1);
    expect(key).toMatch(
      new RegExp(`^media/${month()}/[0-9a-f]{12}4[0-9a-f]{3}\\.${ext}$`),
    );
    expect(res.body).toEqual({
      uploadUrl: `${ORIGIN}/api/admin/media/objects/${encodeURIComponent(key)}`,
      publicPath: `/${key}`,
      headers: { 'Content-Type': contentType },
      expiresAt: expect.any(String),
    });
    const expires = Date.parse(res.body.expiresAt) - before;
    expect(expires).toBeGreaterThanOrEqual(15 * 60_000 - 1_000);
    expect(expires).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it.each([
    [{}, { contentType: 'invalid_value', contentLength: 'invalid_type' }],
    [
      { contentType: 'image/bmp', contentLength: 0, filename: '' },
      {
        contentType: 'invalid_value',
        contentLength: 'too_small',
        filename: 'too_small',
      },
    ],
    [
      {
        contentType: 'image/png',
        contentLength: 10 * 1024 * 1024 + 1,
        filename: 'x'.repeat(201),
      },
      { contentLength: 'too_big', filename: 'too_big' },
    ],
    [
      { contentType: 'image/png', contentLength: 1.5 },
      { contentLength: 'invalid_type' },
    ],
  ])('rejects %j', async (body, fields) => {
    const res = await uploadUrl(local, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
  });

  it('presigns a PUT that signs the length', async () => {
    const res = await uploadUrl(s3, {
      contentType: 'image/png',
      contentLength: 1234,
    });
    expect(res.status).toBe(200);
    const url = new URL(res.body.uploadUrl);
    expect(url.origin).toBe(
      'https://gagnechris-it-media.s3.us-east-1.amazonaws.com',
    );
    expect(url.pathname).toBe(res.body.publicPath);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-length',
    );
    expect(res.body.headers).toEqual({ 'Content-Type': 'image/png' });
  });
});

describe('PUT /api/admin/media/objects/:key', () => {
  const put = (h: Harness, key: string, body?: string) =>
    h.api.request(
      'PUT',
      `/api/admin/media/objects/${encodeURIComponent(key)}`,
      {
        body,
        headers: { 'content-type': 'image/png' },
        claims: siteAdmin(),
      },
    );

  it('writes the upload into the local site root', async () => {
    const res = await uploadUrl(local, {
      contentType: 'image/png',
      contentLength: 5,
    });
    const key = res.body.publicPath.slice(1);
    const stored = await put(local, key, 'bytes');
    expect(stored.status).toBe(204);
    expect(stored.body).toBeUndefined();
    expect(readFileSync(join(root, key), 'utf8')).toBe('bytes');
  });

  it('needs a body', async () => {
    const res = await put(local, 'media/2026/01/empty.png');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Content-Length required',
    });
  });

  it('refuses keys outside media/', async () => {
    for (const key of ['site/index.html', 'media/../index.html']) {
      expect((await put(local, key, 'x')).status, key).toBe(500);
    }
  });

  it('is not served without filesystem storage', async () => {
    const res = await put(s3, 'media/2026/01/a.png', 'x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'not_found',
      message: 'Local media PUT is only available in filesystem mode',
    });
  });
});

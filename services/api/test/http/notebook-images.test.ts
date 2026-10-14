import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MEDIA_MAX_BYTES } from '@gagnechris/shared';
import { notebookUser } from './support/claims.js';
import { useApi, type Harness } from './support/harness.js';

const root = mkdtempSync(join(tmpdir(), 'notebook-media-'));
const site = mkdtempSync(join(tmpdir(), 'notebook-media-site-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(site, { recursive: true, force: true });
});

const ORIGIN = 'http://media.test:1234';
const NAME = /^[0-9a-f]{16}\.png$/;

const local = useApi('notebook-images-local', {
  env: {
    SITE_STORAGE: 'filesystem',
    SITE_BUCKET_NAME: site,
    NOTEBOOK_MEDIA_BUCKET_NAME: root,
    VITE_LOCAL_API_ORIGIN: `${ORIGIN}/`,
  },
});
const s3 = useApi('notebook-images-s3', {
  env: {
    SITE_STORAGE: 's3',
    SITE_BUCKET_NAME: 'gagnechris-it-media',
    NOTEBOOK_MEDIA_BUCKET_NAME: 'gagnechris-it-notebook-media',
  },
});
const unconfigured = useApi('notebook-images-unconfigured', {
  env: { SITE_STORAGE: 's3', NOTEBOOK_MEDIA_BUCKET_NAME: '' },
});

const uploadUrl = (h: Harness, body: unknown, user = 'alice') =>
  h.api.request('POST', '/api/notebook/images/upload-url', {
    body,
    claims: notebookUser(user),
  });

const imageUrl = (h: Harness, name: string, user = 'alice') =>
  h.api.request('GET', `/api/notebook/images/${name}`, {
    claims: notebookUser(user),
  });

const put = (h: Harness, key: string, body?: string, user = 'alice') =>
  h.api.request(
    'PUT',
    `/api/notebook/images/objects/${encodeURIComponent(key)}`,
    {
      body,
      headers: { 'content-type': 'image/png' },
      claims: notebookUser(user),
    },
  );

const nameOf = (src: string) => src.replace(/^notebook-image:/, '');

describe('POST /api/notebook/images/upload-url', () => {
  it('names the image and points the PUT under the caller’s prefix', async () => {
    const before = Date.now();
    const res = await uploadUrl(local, {
      contentType: 'image/png',
      contentLength: 10,
    });
    expect(res.status).toBe(200);
    const name = nameOf(res.body.src);
    expect(name).toMatch(NAME);
    expect(res.body).toEqual({
      uploadUrl: `${ORIGIN}/api/notebook/images/objects/${encodeURIComponent(`images/alice/${name}`)}`,
      src: `notebook-image:${name}`,
      headers: { 'Content-Type': 'image/png' },
      expiresAt: expect.any(String),
    });
    const expires = Date.parse(res.body.expiresAt) - before;
    expect(expires).toBeGreaterThanOrEqual(15 * 60_000 - 1_000);
    expect(expires).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it.each([
    [{}, { contentType: 'invalid_value', contentLength: 'invalid_type' }],
    [
      { contentType: 'image/svg+xml', contentLength: MEDIA_MAX_BYTES + 1 },
      { contentType: 'invalid_value', contentLength: 'too_big' },
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

  it('presigns a PUT on the private bucket that signs the length', async () => {
    const res = await uploadUrl(s3, {
      contentType: 'image/png',
      contentLength: 1234,
    });
    expect(res.status).toBe(200);
    const url = new URL(res.body.uploadUrl);
    expect(url.origin).toBe(
      'https://gagnechris-it-notebook-media.s3.us-east-1.amazonaws.com',
    );
    expect(url.pathname).toBe(`/images/alice/${nameOf(res.body.src)}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-length',
    );
  });

  it('is a Notebook route', async () => {
    const res = await local.api.request(
      'POST',
      '/api/notebook/images/upload-url',
      { body: { contentType: 'image/png', contentLength: 1 } },
    );
    expect(res.status).toBe(401);
  });
});

describe('without a media bucket', () => {
  it('answers 503 for an upload URL and a read', async () => {
    const upload = await uploadUrl(unconfigured, {
      contentType: 'image/png',
      contentLength: 1,
    });
    expect(upload.status).toBe(503);
    const read = await imageUrl(unconfigured, '0123456789abcdef.png');
    expect(read.status).toBe(503);
  });
});

describe('GET /api/notebook/images/:name', () => {
  it('reads back what the owner uploaded, and only for the owner', async () => {
    const res = await uploadUrl(local, {
      contentType: 'image/png',
      contentLength: 5,
    });
    const name = nameOf(res.body.src);
    expect((await put(local, `images/alice/${name}`, 'bytes')).status).toBe(
      204,
    );
    expect(readFileSync(join(root, 'images/alice', name), 'utf8')).toBe(
      'bytes',
    );

    const read = await imageUrl(local, name);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({
      url: `data:image/png;base64,${Buffer.from('bytes').toString('base64')}`,
      expiresAt: expect.any(String),
    });

    expect((await imageUrl(local, name, 'bob')).status).toBe(404);
  });

  it('presigns a GET under the caller’s prefix', async () => {
    const res = await imageUrl(s3, '0123456789abcdef.png');
    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(url.origin).toBe(
      'https://gagnechris-it-notebook-media.s3.us-east-1.amazonaws.com',
    );
    expect(url.pathname).toBe('/images/alice/0123456789abcdef.png');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
  });

  it('rejects names that are not image names', async () => {
    for (const name of ['abc.png', '0123456789abcdef.svg', '..%2Fx.png']) {
      const res = await imageUrl(local, name);
      expect(res.status, name).toBe(400);
    }
  });
});

describe('PUT /api/notebook/images/objects/:key', () => {
  it('refuses keys that are not image keys', async () => {
    for (const key of [
      'media/0123456789abcdef.png',
      'images/alice/../0123456789abcdef.png',
      'images/../../0123456789abcdef.png',
      'images/alice/index.html',
    ]) {
      const res = await put(local, key, 'x');
      expect(res.status, key).toBe(400);
    }
  });

  it('is not served without filesystem storage', async () => {
    const res = await put(s3, 'images/alice/0123456789abcdef.png', 'x');
    expect(res.status).toBe(404);
  });
});

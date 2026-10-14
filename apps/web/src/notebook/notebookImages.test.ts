import type { ApiClient } from '@gagnechris/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notebookImageNames,
  notebookImageResolver,
  uploadNotebookImages,
} from './notebookImages';

const NAME = '0123456789abcdef.png';

afterEach(() => vi.unstubAllGlobals());

function client(over: Partial<Record<'GET' | 'POST', unknown>>) {
  return over as unknown as ApiClient;
}

describe('uploadNotebookImages', () => {
  it('PUTs each file to its signed URL and returns the markdown src', async () => {
    const POST = vi.fn().mockResolvedValue({
      data: {
        uploadUrl: 'https://bucket.test/images/u/x.png?sig',
        src: `notebook-image:${NAME}`,
        headers: { 'Content-Type': 'image/png' },
        expiresAt: '2026-10-14T00:15:00.000Z',
      },
      response: { status: 200 },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['png'], 'Screenshot.png', { type: 'image/png' });

    await expect(
      uploadNotebookImages(client({ POST }), [file]),
    ).resolves.toEqual([`notebook-image:${NAME}`]);
    expect(POST).toHaveBeenCalledWith('/api/notebook/images/upload-url', {
      body: { contentType: 'image/png', contentLength: 3 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bucket.test/images/u/x.png?sig',
      { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file },
    );
  });

  it('refuses types the API does not store', async () => {
    const file = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });
    await expect(uploadNotebookImages(client({}), [file])).rejects.toThrow(
      'Unsupported image type: image/svg+xml',
    );
  });
});

describe('notebookImageResolver', () => {
  it('signs a Notebook image once until it nears expiry, and passes other srcs through', async () => {
    let now = Date.parse('2026-10-14T00:00:00.000Z');
    const GET = vi.fn().mockResolvedValue({
      data: {
        url: 'https://signed.test/a',
        expiresAt: '2026-10-14T01:00:00.000Z',
      },
      response: { status: 200 },
    });
    const resolve = notebookImageResolver(
      () => client({ GET }),
      () => now,
    );

    expect(resolve('/media/a.png')).toBe('/media/a.png');
    await expect(resolve(`notebook-image:${NAME}`)).resolves.toBe(
      'https://signed.test/a',
    );
    await resolve(`notebook-image:${NAME}`);
    expect(GET).toHaveBeenCalledTimes(1);
    expect(GET).toHaveBeenCalledWith('/api/notebook/images/{name}', {
      params: { path: { name: NAME } },
    });

    now = Date.parse('2026-10-14T00:56:00.000Z');
    await resolve(`notebook-image:${NAME}`);
    expect(GET).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failed load', async () => {
    const GET = vi
      .fn()
      .mockResolvedValueOnce({ response: { status: 404 } })
      .mockResolvedValue({
        data: {
          url: 'https://signed.test/a',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        response: { status: 200 },
      });
    const resolve = notebookImageResolver(() => client({ GET }));
    await expect(resolve(`notebook-image:${NAME}`)).rejects.toThrow('404');
    await expect(resolve(`notebook-image:${NAME}`)).resolves.toBe(
      'https://signed.test/a',
    );
  });
});

describe('notebookImageNames', () => {
  it('lists each Notebook image once and ignores other images', () => {
    expect(
      notebookImageNames(
        `![a](notebook-image:${NAME})\n![b](/media/x.png)\n![c](notebook-image:${NAME})\n![d](notebook-image:nope.png)`,
      ),
    ).toEqual([NAME]);
  });
});

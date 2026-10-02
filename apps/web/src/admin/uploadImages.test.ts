import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { ApiClient } from '@gagnechris/api-client';

describe('uploadImages', () => {
  const post = vi.fn();
  const client = {
    POST: (...args: unknown[]) => post(...args),
  } as unknown as ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }) as Response),
    );
  });

  test('rejects unsupported MIME types', async () => {
    const { uploadImages } = await import('./uploadImages');
    await expect(
      uploadImages(client, [new File(['x'], 'a.txt', { type: 'text/plain' })]),
    ).rejects.toThrow(/Unsupported image type/);
    expect(post).not.toHaveBeenCalled();
  });

  test('uploads allowed types via signed URL', async () => {
    post.mockResolvedValue({
      data: {
        uploadUrl: 'https://upload.example/put',
        headers: { 'Content-Type': 'image/png' },
        publicPath: '/media/abc.png',
      },
      error: undefined,
      response: { status: 200 },
    });
    const { uploadImages } = await import('./uploadImages');
    const paths = await uploadImages(client, [
      new File(['png'], 'shot.png', { type: 'image/png' }),
    ]);
    expect(paths).toEqual(['/media/abc.png']);
    expect(post).toHaveBeenCalledWith(
      '/api/admin/media/upload-url',
      expect.objectContaining({
        body: expect.objectContaining({ contentType: 'image/png' }),
      }),
    );
  });
});

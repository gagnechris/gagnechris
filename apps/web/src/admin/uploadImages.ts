import { MEDIA_CONTENT_TYPES, type MediaContentType } from '@gagnechris/shared';
import { createApiClient } from '../api/client';

const allowed = new Set<string>(MEDIA_CONTENT_TYPES);

/**
 * Request a signed upload URL per file, PUT the bytes, return public paths.
 * Uses shared `MEDIA_CONTENT_TYPES` (CHR-132).
 */
export async function uploadImages(files: File[]): Promise<string[]> {
  const client = createApiClient();
  const paths: string[] = [];

  for (const file of files) {
    if (!allowed.has(file.type)) {
      throw new Error(`Unsupported image type: ${file.type || file.name}`);
    }
    const contentType = file.type as MediaContentType;
    const { data, error, response } = await client.POST(
      '/api/admin/media/upload-url',
      {
        body: {
          contentType,
          contentLength: file.size,
          filename: file.name,
        },
      },
    );
    if (error || !data) {
      throw new Error(
        `Image upload rejected (${response.status}): ${file.name || file.type}`,
      );
    }
    const put = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: data.headers,
      body: file,
    });
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status}) for ${file.name}`);
    }
    paths.push(data.publicPath);
  }
  return paths;
}

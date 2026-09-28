import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  MediaContentType,
  MediaUploadUrlRequest,
  MediaUploadUrlResponse,
} from '@gagnechris/shared';

const EXT_BY_TYPE: Record<MediaContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UPLOAD_TTL_SECONDS = 15 * 60;

let s3Client: S3Client | undefined;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

/** Test helper. */
export function setS3Client(client: S3Client | undefined): void {
  s3Client = client;
}

export function requireSiteBucketName(): string {
  const name = process.env.SITE_BUCKET_NAME?.trim();
  if (!name) {
    throw new Error('SITE_BUCKET_NAME is not set');
  }
  return name;
}

function extensionFor(
  contentType: MediaContentType,
  filename?: string,
): string {
  if (filename) {
    const match = /\.([a-zA-Z0-9]{1,8})$/.exec(filename.trim());
    if (match) {
      const ext = match[1]!.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  }
  return EXT_BY_TYPE[contentType];
}

export function buildMediaObjectKey(
  contentType: MediaContentType,
  filename?: string,
  now: Date = new Date(),
): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = randomUUID().replace(/-/g, '').slice(0, 16);
  const ext = extensionFor(contentType, filename);
  return `media/${yyyy}/${mm}/${id}.${ext}`;
}

export async function createMediaUploadUrl(
  input: MediaUploadUrlRequest,
): Promise<MediaUploadUrlResponse> {
  const bucket = requireSiteBucketName();
  const key = buildMediaObjectKey(input.contentType, input.filename);
  const publicPath = `/${key}`;
  const expiresAt = new Date(
    Date.now() + UPLOAD_TTL_SECONDS * 1000,
  ).toISOString();
  const headers = {
    'Content-Type': input.contentType,
  };

  if (process.env.SITE_STORAGE === 'filesystem') {
    const origin =
      process.env.VITE_LOCAL_API_ORIGIN?.trim() ||
      `http://127.0.0.1:${process.env.LOCAL_API_PORT || 8787}`;
    return {
      uploadUrl: `${origin.replace(/\/$/, '')}/api/admin/media/objects/${encodeURIComponent(key)}`,
      publicPath,
      headers,
      expiresAt,
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });
  const uploadUrl = await getSignedUrl(getS3(), command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  });

  return {
    uploadUrl,
    publicPath,
    headers,
    expiresAt,
  };
}

/**
 * Local filesystem PUT target (SITE_STORAGE=filesystem only).
 * Writes under SITE_BUCKET_NAME which is the .local-site root.
 */
export async function writeLocalMediaObject(
  key: string,
  body: Buffer,
  contentType: string,
  expectedLength: number,
): Promise<void> {
  if (process.env.SITE_STORAGE !== 'filesystem') {
    throw new Error(
      'Local media write only allowed when SITE_STORAGE=filesystem',
    );
  }
  if (!key.startsWith('media/') || key.includes('..')) {
    throw new Error('Invalid media key');
  }
  if (body.length !== expectedLength) {
    throw new Error(
      `Content-Length mismatch: expected ${expectedLength}, got ${body.length}`,
    );
  }
  const root = requireSiteBucketName();
  const dest = join(root, key);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body);
  void contentType;
}

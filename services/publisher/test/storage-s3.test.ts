import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const s3Send = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: class S3Client {
      send(...args: unknown[]) {
        return s3Send(...args);
      }
    },
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
  };
});

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class CloudFrontClient {},
  CreateInvalidationCommand: class CreateInvalidationCommand {},
}));

function sentCommands(): string[] {
  return s3Send.mock.calls.map(
    (call) => (call[0] as { constructor: { name: string } }).constructor.name,
  );
}

describe('S3 site storage delete', () => {
  const prevBucket = process.env.SITE_BUCKET_NAME;

  beforeEach(() => {
    process.env.SITE_BUCKET_NAME = 'test-bucket';
    s3Send.mockReset();
  });

  afterEach(() => {
    if (prevBucket === undefined) delete process.env.SITE_BUCKET_NAME;
    else process.env.SITE_BUCKET_NAME = prevBucket;
  });

  it('returns false and sends no DeleteObject when the key is absent', async () => {
    s3Send.mockImplementation(
      async (cmd: { constructor: { name: string } }) => {
        if (cmd.constructor.name === 'HeadObjectCommand') {
          throw Object.assign(new Error('NotFound'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          });
        }
        return {};
      },
    );
    const { createS3SiteStorage } = await import('../src/storage-s3.js');

    await expect(createS3SiteStorage().delete('resume.pdf')).resolves.toBe(
      false,
    );
    expect(sentCommands()).toEqual(['HeadObjectCommand']);
  });

  it('returns true after deleting an existing key', async () => {
    s3Send.mockResolvedValue({});
    const { createS3SiteStorage } = await import('../src/storage-s3.js');

    await expect(createS3SiteStorage().delete('resume.pdf')).resolves.toBe(
      true,
    );
    expect(sentCommands()).toEqual([
      'HeadObjectCommand',
      'DeleteObjectCommand',
    ]);
  });

  it('rethrows non-404 Head errors', async () => {
    s3Send.mockRejectedValue(
      Object.assign(new Error('AccessDenied'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    );
    const { createS3SiteStorage } = await import('../src/storage-s3.js');

    await expect(createS3SiteStorage().delete('resume.pdf')).rejects.toThrow(
      'AccessDenied',
    );
  });
});

describe('S3 site storage put', () => {
  const prevBucket = process.env.SITE_BUCKET_NAME;
  const body = '<html>same</html>';
  const etag = `"${createHash('md5').update(body).digest('hex')}"`;

  beforeEach(() => {
    process.env.SITE_BUCKET_NAME = 'test-bucket';
    s3Send.mockReset();
  });

  afterEach(() => {
    if (prevBucket === undefined) delete process.env.SITE_BUCKET_NAME;
    else process.env.SITE_BUCKET_NAME = prevBucket;
  });

  const stored = (headers: Record<string, string | undefined>) =>
    s3Send.mockImplementation(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === 'HeadObjectCommand'
        ? { ETag: etag, ...headers }
        : {},
    );

  it('skips when the bytes and every header match', async () => {
    stored({
      ContentType: 'application/pdf',
      CacheControl: 'public,max-age=300',
      ContentDisposition: 'inline; filename="resume.pdf"',
    });
    const { createS3SiteStorage } = await import('../src/storage-s3.js');

    await expect(
      createS3SiteStorage().put({
        key: 'resume.pdf',
        body: body,
        contentType: 'application/pdf',
        cacheControl: 'public,max-age=300',
        contentDisposition: 'inline; filename="resume.pdf"',
      }),
    ).resolves.toBe(false);
    expect(sentCommands()).toEqual(['HeadObjectCommand']);
  });

  it.each([
    ['Cache-Control', { CacheControl: 'public,max-age=60' }],
    ['Content-Type', { ContentType: 'text/plain' }],
    ['Content-Disposition', { ContentDisposition: 'attachment' }],
  ])('rewrites unchanged bytes when %s differs', async (_header, overrides) => {
    stored({
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'public,max-age=0,must-revalidate',
      ...overrides,
    });
    const { createS3SiteStorage } = await import('../src/storage-s3.js');

    await expect(
      createS3SiteStorage().put({
        key: 'index.html',
        body: body,
        contentType: 'text/html; charset=utf-8',
        cacheControl: 'public,max-age=0,must-revalidate',
      }),
    ).resolves.toBe(true);
    expect(sentCommands()).toEqual(['HeadObjectCommand', 'PutObjectCommand']);
  });
});

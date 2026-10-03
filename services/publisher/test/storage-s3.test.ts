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

describe('S3 site storage delete (CHR-167 / CHR-201)', () => {
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

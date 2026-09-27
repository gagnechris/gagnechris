import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { isLocalCloudFront, requireEnv } from './config.js';
import { SITE_SHELL_KEY, type SiteStorage } from './storage.js';

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});

export function createS3SiteStorage(): SiteStorage {
  const bucket = requireEnv('SITE_BUCKET_NAME');

  return {
    async readShell(): Promise<string> {
      const out = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: SITE_SHELL_KEY }),
      );
      const body = await out.Body?.transformToString('utf-8');
      if (!body) {
        throw new Error(`Site shell ${SITE_SHELL_KEY} is empty or missing`);
      }
      return body;
    },

    async put(
      key: string,
      body: string | Uint8Array,
      contentType: string,
      cacheControl: string,
      contentDisposition?: string,
    ): Promise<void> {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
          ...(contentDisposition
            ? { ContentDisposition: contentDisposition }
            : {}),
        }),
      );
    },

    async delete(key: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of page.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return keys;
    },

    async invalidate(paths: string[]): Promise<void> {
      if (isLocalCloudFront()) return;
      const distributionId = requireEnv('CLOUDFRONT_DISTRIBUTION_ID');
      const unique = [...new Set(paths)].filter(Boolean);
      if (unique.length === 0) return;
      await cloudfront.send(
        new CreateInvalidationCommand({
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: `publisher-${Date.now()}`,
            Paths: { Quantity: unique.length, Items: unique },
          },
        }),
      );
    },
  };
}

// Callers load this with import() so the SDK stays out of the cold start. A static
// re-export bundles to require(), which resolves the Lambda runtime's SDK; a bare import() would not.
export { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
export { getSignedUrl } from '@aws-sdk/s3-request-presigner';

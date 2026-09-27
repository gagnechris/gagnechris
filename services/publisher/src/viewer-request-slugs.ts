/**
 * Sync published blog slugs into the CloudFront viewer-request function so
 * unknown /blog/<slug> requests rewrite to /404.html instead of S3 XML (CHR-102).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CloudFrontClient,
  DescribeFunctionCommand,
  PublishFunctionCommand,
  UpdateFunctionCommand,
} from '@aws-sdk/client-cloudfront';
import { Logger } from '@aws-lambda-powertools/logger';
import { isLocalCloudFront } from './config.js';

const logger = new Logger({ serviceName: 'gagnechris-publisher' });

const SLUGS_MARKER = '/*__PUBLISHED_BLOG_SLUGS__*/';
const SLUGS_DECL_RE =
  /var PUBLISHED_BLOG_SLUGS = [\s\S]*?; \/\*__PUBLISHED_BLOG_SLUGS__\*\//;

/** Bundled next to the Lambda handler in prod; repo path for local/tests. */
export function viewerRequestTemplatePath(): string {
  const candidates = [
    process.env.LAMBDA_TASK_ROOT
      ? join(process.env.LAMBDA_TASK_ROOT, 'viewer-request-function.js')
      : '',
    join(process.cwd(), 'viewer-request-function.js'),
    join(process.cwd(), 'infra/lib/cloudfront/viewer-request-function.js'),
    join(
      process.cwd(),
      '../../infra/lib/cloudfront/viewer-request-function.js',
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `viewer-request-function.js not found (cwd=${process.cwd()})`,
  );
}

export function buildViewerRequestSource(
  template: string,
  slugs: string[],
): string {
  const map: Record<string, number> = {};
  for (const slug of slugs) {
    if (slug) map[slug] = 1;
  }
  const decl = `var PUBLISHED_BLOG_SLUGS = ${JSON.stringify(map)}; ${SLUGS_MARKER}`;
  if (!SLUGS_DECL_RE.test(template)) {
    throw new Error(
      'viewer-request template missing PUBLISHED_BLOG_SLUGS marker',
    );
  }
  return template.replace(SLUGS_DECL_RE, () => decl);
}

const cloudfront = new CloudFrontClient({});

/**
 * Replace the LIVE viewer-request allowlist with the current published slugs.
 * No-ops locally and when VIEWER_REQUEST_FUNCTION_NAME is unset.
 */
export async function syncViewerRequestBlogSlugs(
  slugs: string[],
): Promise<void> {
  if (isLocalCloudFront()) return;
  const functionName = process.env.VIEWER_REQUEST_FUNCTION_NAME;
  if (!functionName) {
    logger.warn('VIEWER_REQUEST_FUNCTION_NAME unset; skipped CF Function sync');
    return;
  }

  const template = readFileSync(viewerRequestTemplatePath(), 'utf8');
  const source = buildViewerRequestSource(template, slugs);

  const described = await cloudfront.send(
    new DescribeFunctionCommand({
      Name: functionName,
      Stage: 'DEVELOPMENT',
    }),
  );
  if (!described.ETag) {
    throw new Error(`DescribeFunction missing ETag for ${functionName}`);
  }

  const updated = await cloudfront.send(
    new UpdateFunctionCommand({
      Name: functionName,
      IfMatch: described.ETag,
      FunctionConfig: {
        Comment:
          described.FunctionSummary?.FunctionConfig?.Comment ??
          'www→apex + Option B + 404/SPA rewrite',
        Runtime: 'cloudfront-js-2.0',
      },
      FunctionCode: Buffer.from(source, 'utf8'),
    }),
  );
  if (!updated.ETag) {
    throw new Error(`UpdateFunction missing ETag for ${functionName}`);
  }

  await cloudfront.send(
    new PublishFunctionCommand({
      Name: functionName,
      IfMatch: updated.ETag,
    }),
  );

  logger.info('Synced viewer-request blog slug allowlist', {
    functionName,
    slugCount: slugs.length,
  });
}

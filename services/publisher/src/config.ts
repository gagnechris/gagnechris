export const APEX =
  process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

/** True when CloudFront invalidation should be skipped (local / tests). */
export function isLocalCloudFront(): boolean {
  const id = process.env.CLOUDFRONT_DISTRIBUTION_ID?.trim();
  return !id || id === 'local';
}

/** `filesystem` for local E2E; default `s3` for Lambda. */
export function siteStorageMode(): 's3' | 'filesystem' {
  const mode = process.env.SITE_STORAGE?.trim().toLowerCase();
  if (mode === 'filesystem' || mode === 'fs') {
    return 'filesystem';
  }
  return 's3';
}

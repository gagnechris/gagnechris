export const APEX =
  process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

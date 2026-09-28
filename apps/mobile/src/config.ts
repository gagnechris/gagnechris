/**
 * Local stack / prod API target for the mobile spike (CHR-142).
 * Default: local CMS API (`npm run local:dev` → :8787).
 * Override with EXPO_PUBLIC_API_BASE_URL.
 */
export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';

/** Matches web local auth (`VITE_AUTH_MODE=local`). */
export const localDevToken = 'local-dev-token';

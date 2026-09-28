import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * Typed OpenAPI client for public `/api/*` routes (no Cognito / Amplify).
 * Safe to import from Contact, Resume, and other public pages.
 */
export const createPublicApiClient = () =>
  createClient<paths>({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  });

export type PublicApiClient = ReturnType<typeof createPublicApiClient>;

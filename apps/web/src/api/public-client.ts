import { createApiClient, type ApiClient } from '@gagnechris/api-client';

/**
 * Typed OpenAPI client for public `/api/*` routes (no Cognito / Amplify).
 * Safe to import from Contact, Resume, and other public pages.
 */
export const createPublicApiClient = (): ApiClient =>
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  });

export type PublicApiClient = ApiClient;

import { createApiClient, type ApiClient } from '@gagnechris/api-client';

/** No Cognito / Amplify, so public pages can import it. */
export const createPublicApiClient = (): ApiClient =>
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  });

export type PublicApiClient = ApiClient;

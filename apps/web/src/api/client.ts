import {
  createApiClient as createTypedClient,
  type ApiClient,
} from '@gagnechris/api-client';
import { getIdToken } from '../auth/session';

/**
 * Typed OpenAPI client for `/api/*`. Uses Cognito ID tokens (API JWT `aud`).
 * Lazy-import from admin code so Amplify never ships in the public bundle.
 */
export const createApiClient = (): ApiClient =>
  createTypedClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getToken: getIdToken,
  });

export type { ApiClient };

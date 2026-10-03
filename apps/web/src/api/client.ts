import {
  createApiClient as createTypedClient,
  type ApiClient,
} from '@gagnechris/api-client';
import { getIdToken } from '../auth/session';

/** Lazy-import from admin code only, so Amplify never ships in the public bundle. */
export const createApiClient = (): ApiClient =>
  createTypedClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getToken: getIdToken,
  });

export type { ApiClient };

import { createApiClient } from '@gagnechris/api-client';
import { apiBaseUrl, localDevToken } from './config';

/** Public client (no token) — health, contact, etc. */
export const createPublicClient = () =>
  createApiClient({ baseUrl: apiBaseUrl });

/** Authenticated client for local stack fake JWT. */
export const createAuthedClient = () =>
  createApiClient({
    baseUrl: apiBaseUrl,
    getToken: async () => localDevToken,
  });

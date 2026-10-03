import { createApiClient } from '@gagnechris/api-client';
import { apiBaseUrl, localDevToken } from './config';

export const createPublicClient = () =>
  createApiClient({ baseUrl: apiBaseUrl });

export const createAuthedClient = () =>
  createApiClient({
    baseUrl: apiBaseUrl,
    getToken: async () => localDevToken,
  });

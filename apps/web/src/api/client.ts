import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { getIdToken } from '../auth/session';

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await getIdToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
};

/**
 * Typed OpenAPI client for `/api/*`. Uses Cognito ID tokens (API JWT `aud`).
 * Lazy-import from admin code so Amplify never ships in the public bundle.
 */
export const createApiClient = () => {
  const client = createClient<paths>({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  });
  client.use(authMiddleware);
  return client;
};

export type ApiClient = ReturnType<typeof createApiClient>;

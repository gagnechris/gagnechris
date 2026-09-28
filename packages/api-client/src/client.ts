import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

/** Returns a bearer token for authenticated requests, or null/undefined to skip. */
export type TokenProvider = () => Promise<string | null | undefined>;

export type CreateApiClientOptions = {
  baseUrl: string;
  /** When omitted, no Authorization header is set (public routes). */
  getToken?: TokenProvider;
};

/**
 * Typed OpenAPI client for `/api/*`.
 * Web passes an Amplify-based `getToken`; React Native will pass Amplify-RN /
 * SecureStore; public callers omit `getToken`.
 */
export const createApiClient = ({
  baseUrl,
  getToken,
}: CreateApiClientOptions) => {
  const client = createClient<paths>({ baseUrl });
  if (getToken) {
    const authMiddleware: Middleware = {
      async onRequest({ request }) {
        const token = await getToken();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
        return request;
      },
    };
    client.use(authMiddleware);
  }
  return client;
};

export type ApiClient = ReturnType<typeof createApiClient>;

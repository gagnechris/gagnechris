import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type TokenProviderOptions = {
  forceRefresh?: boolean;
};

export type TokenProvider = (
  options?: TokenProviderOptions,
) => Promise<string | null | undefined>;

export type CreateApiClientOptions = {
  baseUrl: string;
  getToken?: TokenProvider;
  /**
   * Retries 403 too: a token minted before the user joined the admin group
   * lacks the new `cognito:groups` until refreshed.
   */
  retryOnUnauthorized?: boolean;
};

const RETRIED_HEADER = 'x-gagnechris-auth-retried';

export const createApiClient = ({
  baseUrl,
  getToken,
  retryOnUnauthorized = true,
}: CreateApiClientOptions) => {
  const client = createClient<paths>({ baseUrl });
  if (!getToken) {
    return client;
  }

  // Cloned up front so POST bodies survive a retry.
  const clones = new Map<string, globalThis.Request>();

  const authMiddleware: Middleware = {
    async onRequest({ request, id }) {
      clones.set(id, request.clone());
      const token = await getToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ request, response, options, id }) {
      const clone = clones.get(id);
      clones.delete(id);
      if (
        !retryOnUnauthorized ||
        (response.status !== 401 && response.status !== 403) ||
        request.headers.get(RETRIED_HEADER) === '1' ||
        !clone
      ) {
        return undefined;
      }
      const token = await getToken({ forceRefresh: true });
      const headers = new globalThis.Headers(clone.headers);
      headers.set(RETRIED_HEADER, '1');
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        headers.delete('Authorization');
      }
      // options.fetch bypasses middleware, so the refreshed token is set here.
      return options.fetch(new globalThis.Request(clone, { headers }));
    },
  };
  client.use(authMiddleware);
  return client;
};

export type ApiClient = ReturnType<typeof createApiClient>;

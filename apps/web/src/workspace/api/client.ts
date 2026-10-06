import {
  createApiClient as createTypedClient,
  type ApiClient,
} from '@gagnechris/api-client';
import { reportAccessDenied } from '../auth/accessWatch';
import { getIdToken } from '../auth/session';

const watched = <
  F extends (...args: never[]) => Promise<{ response: Response }>,
>(
  call: F,
): F =>
  (async (...args: Parameters<F>) => {
    const result = await call(...args);
    if (result.response.status === 401 || result.response.status === 403) {
      reportAccessDenied();
    }
    return result;
  }) as F;

/** Lazy-import from admin code only, so Amplify never ships in the public bundle. */
export const createApiClient = (): ApiClient => {
  const client = createTypedClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    getToken: getIdToken,
  });
  return {
    ...client,
    GET: watched(client.GET),
    PUT: watched(client.PUT),
    POST: watched(client.POST),
    DELETE: watched(client.DELETE),
    PATCH: watched(client.PATCH),
  };
};

export type { ApiClient };

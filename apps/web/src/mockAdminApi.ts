import { vi } from 'vitest';

/** The verbs of the API client every page under test gets. */
export const adminApi = {
  GET: vi.fn(),
  PUT: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
  PATCH: vi.fn(),
};

/**
 * Stands in for `workspace/api/client`, so pages call `adminApi`:
 * `vi.mock('../workspace/api/client', () => import('../mockAdminApi').then((m) => m.mockAdminApi()))`.
 */
export const mockAdminApi = () => ({ createApiClient: () => adminApi });

import { describe, expect, it } from 'vitest';
import { API_SERVICE_NAME } from '@gagnechris/shared';
import { useApi } from './support/harness.js';

const h = useApi('health', { truncate: false });

describe('health', () => {
  it.each(['/api/health', '/api/health/'])(
    'GET %s is ok and cacheable',
    async (path) => {
      const res = await h.api.request('GET', path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: API_SERVICE_NAME });
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toBeNull();
    },
  );

  it('answers 405 with Allow for another method', async () => {
    const res = await h.api.request('POST', '/api/health');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.body).toEqual({
      error: 'method_not_allowed',
      message: 'Method POST not allowed; use GET',
    });
  });

  it('answers 404 for a path no route serves', async () => {
    const res = await h.api.request('GET', '/api/no-such-route/');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'not_found',
      message: 'No route for GET /api/no-such-route',
    });
  });
});

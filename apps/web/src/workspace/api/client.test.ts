import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { onAccessDenied } from '../auth/accessWatch';
import { createApiClient } from './client';

vi.mock('../auth/session', () => ({
  getIdToken: vi.fn(async () => 'token'),
}));

describe('createApiClient', () => {
  const denied = vi.fn();
  let stop: () => void;

  beforeEach(() => {
    stop = onAccessDenied(denied);
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test');
  });

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    denied.mockReset();
  });

  const respond = (status: number) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status })),
    );

  test('reports a request still refused after the token retry', async () => {
    respond(403);
    await createApiClient().GET('/api/admin/posts');
    expect(denied).toHaveBeenCalledTimes(1);
  });

  test('says nothing for other responses', async () => {
    respond(500);
    await createApiClient().GET('/api/admin/posts');
    respond(200);
    await createApiClient().GET('/api/admin/posts');
    expect(denied).not.toHaveBeenCalled();
  });
});

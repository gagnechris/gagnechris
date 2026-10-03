import { describe, expect, it } from 'vitest';
import { handler } from '../src/handler.js';
import { claimGroups } from '../src/router.js';
import { makeEvent } from './support/make-event.js';

const call = async (
  method: string,
  path: string,
  claims: Record<string, string>,
  adminGroup = true,
) =>
  (await handler(
    makeEvent(method, path, { jwtClaims: claims, adminGroup }),
    {} as never,
    () => undefined,
  )) as { statusCode: number; body: string };

describe('admin group gate (CHR-195)', () => {
  const routes: Array<[string, string]> = [
    ['GET', '/api/admin/me'],
    ['GET', '/api/admin/posts'],
    ['POST', '/api/admin/posts'],
    ['GET', '/api/notebook/notes'],
    ['GET', '/api/notebook/tasks'],
  ];

  it.each(routes)('%s %s without the admin group → 403', async (m, p) => {
    const result = await call(m, p, { sub: 'someone-else' }, false);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ error: 'forbidden' });
  });

  it('other groups are not enough', async () => {
    const result = await call(
      'GET',
      '/api/admin/me',
      { sub: 'u', 'cognito:groups': '[editors viewers]' },
      false,
    );
    expect(result.statusCode).toBe(403);
  });

  it('admin group passes', async () => {
    const result = await call('GET', '/api/admin/me', {
      sub: 'u',
      'cognito:groups': '[editors admin]',
    });
    expect(result.statusCode).toBe(200);
  });

  it('public routes ignore groups', async () => {
    const result = (await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    )) as { statusCode: number };
    expect(result.statusCode).toBe(200);
  });

  it('parses API Gateway and stringified group claims', () => {
    expect(claimGroups(undefined)).toEqual([]);
    expect(claimGroups('[admin]')).toEqual(['admin']);
    expect(claimGroups('[editors admin]')).toEqual(['editors', 'admin']);
    expect(claimGroups('editors,admin')).toEqual(['editors', 'admin']);
    expect(claimGroups('["admin"]')).toEqual(['admin']);
    expect(claimGroups('[administrators]')).not.toContain('admin');
  });
});

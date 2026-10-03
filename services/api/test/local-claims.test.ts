import { describe, expect, it } from 'vitest';
import { localClaims } from '../local/claims.js';

describe('local API fake claims', () => {
  it.each([undefined, 'Bearer local-dev-token', 'Bearer local:local-dev-user'])(
    'uses the default admin for %s',
    (header) => {
      expect(localClaims(header)).toMatchObject({
        sub: 'local-dev-user',
        email: 'local@gagnechris.com',
        'cognito:groups': '[admin]',
      });
    },
  );

  it('signs in as the sub named in a local token', () => {
    expect(localClaims('Bearer local:e2e-second')).toMatchObject({
      sub: 'e2e-second',
      'cognito:groups': '[admin]',
    });
  });

  it.each(['Bearer local:', 'Bearer local:a b', 'Bearer local:../x'])(
    'rejects a malformed sub in %s',
    (header) => {
      expect(localClaims(header).sub).toBe('local-dev-user');
    },
  );
});

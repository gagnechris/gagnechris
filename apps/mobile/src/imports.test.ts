import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { apiBaseUrl, localDevToken } from './config';

describe('mobile imports', () => {
  it('resolves @gagnechris/shared domain schemas', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      service: 'gagnechris-api',
    });
    expect(parsed.status).toBe('ok');
  });

  it('resolves @gagnechris/tokens colors', () => {
    expect(tokens.primary[500]).toBe('#3d9690');
  });

  it('defaults API base URL to local stack', () => {
    expect(apiBaseUrl).toContain('8787');
    expect(localDevToken).toBe('local-dev-token');
  });
});

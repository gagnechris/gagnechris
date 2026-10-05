import { describe, expect, it } from 'vitest';
import { HealthResponseSchema, parseTaskSyntax } from '@gagnechris/shared';
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

  it('resolves the task syntax parser the web app uses', () => {
    expect(parseTaskSyntax('Ship it @mon !high', '2026-10-02')).toEqual({
      title: 'Ship it',
      startDate: '2026-10-05',
      someday: false,
      priority: 'high',
    });
  });

  it('resolves @gagnechris/tokens colors', () => {
    expect(tokens.primary[500]).toBe('#3d9690');
  });

  it('defaults API base URL to local stack', () => {
    expect(apiBaseUrl).toContain('8787');
    expect(localDevToken).toBe('local-dev-token');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  API_SERVICE_NAME,
  POWERTOOLS_METRICS_NAMESPACE,
} from '@gagnechris/shared';
import { z } from 'zod';
import { handler } from '../src/handler.js';
import { metrics } from '../src/observability.js';
import * as router from '../src/router.js';
import { makeEvent } from './support/make-event.js';

describe('api handler', () => {
  it('GET /api/health returns ok', async () => {
    const result = await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({
      statusCode: 200,
      body: JSON.stringify({ status: 'ok', service: 'gagnechris-api' }),
    });
  });

  it('GET /api/admin/me returns claims', async () => {
    const result = await handler(
      makeEvent('GET', '/api/admin/me', {
        jwtClaims: {
          sub: 'abc-123',
          email: 'admin@example.com',
          'cognito:username': 'admin@example.com',
        },
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body).toEqual({
      sub: 'abc-123',
      email: 'admin@example.com',
      username: 'admin@example.com',
    });
  });

  it('unknown route is 404', async () => {
    const result = await handler(
      makeEvent('GET', '/api/nope'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('does not set CORS headers (API Gateway corsPreflight owns that)', async () => {
    const result = await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    );
    const headers =
      (result as { headers?: Record<string, string> }).headers ?? {};
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('handled 500 emits HandlerError with EMF namespace/service (CHR-168)', async () => {
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dispatch = vi
      .spyOn(router, 'dispatchRoutes')
      .mockRejectedValueOnce(new Error('forced handler failure'));

    try {
      const result = await handler(
        makeEvent('GET', '/api/health'),
        {} as never,
        () => undefined,
      );
      expect(result).toMatchObject({
        statusCode: 500,
        body: JSON.stringify({ error: 'internal_error' }),
      });
      expect(addMetric).toHaveBeenCalledWith(
        'HandlerError',
        MetricUnit.Count,
        1,
      );
      // Alarm pins match the EMF blob: namespace gagnechris + service dim.
      expect(POWERTOOLS_METRICS_NAMESPACE).toBe('gagnechris');
      expect(API_SERVICE_NAME).toBe('gagnechris-api');
      const warnText = warnSpy.mock.calls.map(String).join('\n');
      const errorText = errorSpy.mock.calls.map(String).join('\n');
      expect(warnText).not.toMatch(/reserved key/i);
      expect(errorText).not.toMatch(/reserved key/i);
    } finally {
      dispatch.mockRestore();
      addMetric.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('response-schema ZodError returns 500 not 400 (CHR-168)', async () => {
    const dispatch = vi
      .spyOn(router, 'dispatchRoutes')
      .mockImplementation(async () => {
        z.object({ ok: z.literal(true) }).parse({ ok: false });
        return { statusCode: 200, body: '{}' };
      });
    try {
      const result = await handler(
        makeEvent('GET', '/api/health'),
        {} as never,
        () => undefined,
      );
      expect(result).toMatchObject({ statusCode: 500 });
      const body = JSON.parse((result as { body: string }).body);
      expect(body.error).toBe('internal_error');
      expect(body.error).not.toBe('bad_request');
    } finally {
      dispatch.mockRestore();
    }
  });

  describe('response headers (CHR-196)', () => {
    const headersOf = (result: unknown) =>
      (result as { headers?: Record<string, string> }).headers ?? {};

    it('public health: nosniff, no forced no-store', async () => {
      const headers = headersOf(
        await handler(
          makeEvent('GET', '/api/health'),
          {} as never,
          () => undefined,
        ),
      );
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Cache-Control']).toBeUndefined();
    });

    it('authenticated 200: no-store + nosniff', async () => {
      const result = await handler(
        makeEvent('GET', '/api/admin/me', {
          jwtClaims: { sub: 'abc-123', email: 'admin@example.com' },
        }),
        {} as never,
        () => undefined,
      );
      expect(result).toMatchObject({ statusCode: 200 });
      expect(headersOf(result)).toMatchObject({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'application/json',
      });
    });

    it('router 401 and 403: no-store + nosniff', async () => {
      const unauth = await handler(
        makeEvent('GET', '/api/notebook/notes'),
        {} as never,
        () => undefined,
      );
      expect(unauth).toMatchObject({ statusCode: 401 });
      expect(headersOf(unauth)).toMatchObject({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });

      const forbidden = await handler(
        makeEvent('POST', '/api/notebook/search', {
          jwtClaims: { sub: 'abc-123' },
          adminGroup: false,
          body: { q: 'x' },
        }),
        {} as never,
        () => undefined,
      );
      expect(forbidden).toMatchObject({ statusCode: 403 });
      expect(headersOf(forbidden)).toMatchObject({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
    });

    it('404, 405 and public-route errors: no-store + nosniff', async () => {
      for (const event of [
        makeEvent('GET', '/api/nope'),
        makeEvent('DELETE', '/api/health'),
        makeEvent('POST', '/api/contact', { body: {} }),
      ]) {
        const result = await handler(event, {} as never, () => undefined);
        expect(
          (result as { statusCode: number }).statusCode,
        ).toBeGreaterThanOrEqual(400);
        expect(headersOf(result)).toMatchObject({
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
      }
    });

    it('handled 500: no-store + nosniff', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dispatch = vi
        .spyOn(router, 'dispatchRoutes')
        .mockRejectedValueOnce(new Error('forced'));
      try {
        const result = await handler(
          makeEvent('GET', '/api/health'),
          {} as never,
          () => undefined,
        );
        expect(result).toMatchObject({ statusCode: 500 });
        expect(headersOf(result)).toMatchObject({
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
      } finally {
        dispatch.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });
});

import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  API_SERVICE_NAME,
  POWERTOOLS_METRICS_NAMESPACE,
} from '@gagnechris/shared';
import * as z from 'zod';
import { handler } from '../src/handler.js';
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

  it('handled 500 emits HandlerError with EMF namespace/service', async () => {
    // Powertools Logger/Metrics write through their own Console bound to
    // process.stdout/stderr, so console.* spies never see their output.
    const stdout: string[] = [];
    const stderr: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderr.push(String(chunk));
        return true;
      });
    const dispatch = vi
      .spyOn(router, 'dispatchRoutes')
      .mockRejectedValueOnce(new Error('forced handler failure'));

    let result: unknown;
    try {
      result = await handler(
        makeEvent('GET', '/api/health'),
        {} as never,
        () => undefined,
      );
    } finally {
      dispatch.mockRestore();
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }

    expect(result).toMatchObject({
      statusCode: 500,
      body: JSON.stringify({ error: 'internal_error' }),
    });

    // The EMF blob the HandlerError alarm reads must actually be flushed.
    const emf = stdout
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.includes('"_aws"'))
      .map(
        (line) =>
          JSON.parse(line) as {
            _aws: {
              CloudWatchMetrics: Array<{
                Namespace: string;
                Metrics: Array<{ Name: string }>;
              }>;
            };
            service?: string;
            HandlerError?: number;
          },
      );
    const handlerError = emf.find((blob) => blob.HandlerError === 1);
    expect(handlerError).toBeDefined();
    // Alarm pins match the EMF blob: namespace gagnechris + service dim.
    expect(handlerError!._aws.CloudWatchMetrics[0]!.Namespace).toBe(
      POWERTOOLS_METRICS_NAMESPACE,
    );
    expect(handlerError!.service).toBe(API_SERVICE_NAME);
    expect(POWERTOOLS_METRICS_NAMESPACE).toBe('gagnechris');
    expect(API_SERVICE_NAME).toBe('gagnechris-api');

    // The error log line is written, without a reserved-key WARN.
    const output = [...stdout, ...stderr].join('');
    expect(output).toContain('forced handler failure');
    expect(output).not.toMatch(/reserved key/i);
  });

  it('response-schema ZodError returns 500 not 400', async () => {
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

  describe('gzip', () => {
    const large = { items: Array.from({ length: 200 }, (_, i) => `post ${i}`) };
    const respond = async (headers: Record<string, string>, body: unknown) => {
      const dispatch = vi
        .spyOn(router, 'dispatchRoutes')
        .mockResolvedValueOnce({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      try {
        return (await handler(
          makeEvent('GET', '/api/health', { headers }),
          {} as never,
          () => undefined,
        )) as {
          body: string;
          isBase64Encoded?: boolean;
          headers: Record<string, string>;
        };
      } finally {
        dispatch.mockRestore();
      }
    };

    it('gzips JSON over 1 KB when the client accepts gzip', async () => {
      const result = await respond({ 'accept-encoding': 'gzip, br' }, large);
      expect(result.isBase64Encoded).toBe(true);
      expect(result.headers).toMatchObject({
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
      });
      expect(
        JSON.parse(gunzipSync(Buffer.from(result.body, 'base64')).toString()),
      ).toEqual(large);
    });

    it('leaves small bodies and clients without gzip alone', async () => {
      for (const result of [
        await respond({ 'accept-encoding': 'gzip' }, { status: 'ok' }),
        await respond({}, large),
      ]) {
        expect(result.isBase64Encoded).toBeFalsy();
        expect(result.headers['Content-Encoding']).toBeUndefined();
      }
    });
  });

  describe('response headers', () => {
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
          appToken: false,
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

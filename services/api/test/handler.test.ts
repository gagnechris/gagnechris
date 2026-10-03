import { describe, expect, it, vi } from 'vitest';
import {
  API_SERVICE_NAME,
  POWERTOOLS_METRICS_NAMESPACE,
} from '@gagnechris/shared';
import { z } from 'zod';
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

  it('handled 500 emits HandlerError with EMF namespace/service (CHR-168)', async () => {
    // Powertools Logger/Metrics write through their own Console bound to
    // process.stdout/stderr, so console.* spies never see their output (CHR-201).
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
});

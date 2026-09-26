import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../src/handler.js';

function event(
  method: string,
  path: string,
  claims?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: 'now',
      timeEpoch: Date.now(),
      authorizer: claims
        ? { jwt: { claims, scopes: [] } }
        : undefined,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('api handler', () => {
  it('GET /api/health returns ok', async () => {
    const result = await handler(event('GET', '/api/health'), {} as never, () => undefined);
    expect(result).toMatchObject({
      statusCode: 200,
      body: JSON.stringify({ status: 'ok', service: 'gagnechris-api' }),
    });
  });

  it('GET /api/admin/me returns claims', async () => {
    const result = await handler(
      event('GET', '/api/admin/me', {
        sub: 'abc-123',
        email: 'admin@example.com',
        'cognito:username': 'admin@example.com',
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
    const result = await handler(event('GET', '/api/nope'), {} as never, () => undefined);
    expect(result).toMatchObject({ statusCode: 404 });
  });
});

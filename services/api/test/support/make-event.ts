import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export type MakeEventOptions = {
  body?: unknown;
  query?: Record<string, string>;
  jwtClaims?: Record<string, string>;
  /**
   * Add `cognito:groups: [admin]` to `jwtClaims` like API Gateway passes it
   * (CHR-195). Default true; set false to test a non-admin token.
   */
  adminGroup?: boolean;
  headers?: Record<string, string>;
};

/** Minimal APIGateway HTTP API v2 event for handler tests. */
export function makeEvent(
  method: string,
  path: string,
  opts?: MakeEventOptions,
): APIGatewayProxyEventV2 {
  const query = opts?.query;
  const claims =
    opts?.jwtClaims && opts.adminGroup !== false
      ? { 'cognito:groups': '[admin]', ...opts.jwtClaims }
      : opts?.jwtClaims;
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: query ? new URLSearchParams(query).toString() : '',
    headers: opts?.headers ?? {},
    queryStringParameters: query,
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
    isBase64Encoded: false,
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
      authorizer: claims ? { jwt: { claims, scopes: [] } } : undefined,
    },
  } as APIGatewayProxyEventV2;
}

/** Contact route tests only need body + IP on a stub event. */
export function makeEventWithBody(
  body: unknown,
  ip = '127.0.0.1',
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: { 'user-agent': 'vitest' },
    requestContext: { http: { sourceIp: ip } },
  } as unknown as APIGatewayProxyEventV2;
}

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  AUTH_POLICIES,
  canonicalPath,
  type ProtectedAuth,
} from '../../src/router.js';

export type MakeEventOptions = {
  body?: unknown;
  query?: Record<string, string>;
  /**
   * Merged over an ID token from the app that owns the path (by prefix,
   * `site-admin` otherwise) carrying that app's group.
   */
  jwtClaims?: Record<string, string>;
  /** Set false to send `jwtClaims` alone, with no app client or group. */
  appToken?: boolean;
  headers?: Record<string, string>;
};

export function appIdTokenClaims(auth: ProtectedAuth): Record<string, string> {
  const policy = AUTH_POLICIES[auth];
  return {
    token_use: 'id',
    aud: process.env[policy.clientIdEnv] ?? '',
    'cognito:groups': `[${policy.group}]`,
  };
}

function authForPath(path: string): ProtectedAuth {
  const canonical = canonicalPath(path);
  return canonical === '/notebook' || canonical.startsWith('/notebook/')
    ? 'notebook'
    : 'site-admin';
}

export function makeEvent(
  method: string,
  path: string,
  opts?: MakeEventOptions,
): APIGatewayProxyEventV2 {
  const query = opts?.query;
  const claims =
    opts?.jwtClaims && opts.appToken !== false
      ? { ...appIdTokenClaims(authForPath(path)), ...opts.jwtClaims }
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

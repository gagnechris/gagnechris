import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** The HTTP API (payload 2.0) event API Gateway would send for `req`. */
export function buildGatewayEvent(
  req: IncomingMessage,
  body: Buffer,
  claims: Record<string, string> | undefined,
): APIGatewayProxyEventV2 {
  const host = req.headers.host || '127.0.0.1';
  const url = new URL(req.url || '/', `http://${host}`);
  const method = (req.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
    else if (Array.isArray(v) && v[0]) headers[k.toLowerCase()] = v[0];
  }

  const contentType = headers['content-type'] ?? '';
  const isBinary =
    contentType.startsWith('image/') ||
    contentType.startsWith('application/octet-stream');

  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ''),
    headers,
    queryStringParameters: url.search
      ? Object.fromEntries(url.searchParams)
      : undefined,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: host,
      domainPrefix: 'local',
      http: {
        method,
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: headers['user-agent'] || 'local-api',
      },
      requestId: randomUUID(),
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      ...(claims ? { authorizer: { jwt: { claims, scopes: [] } } } : {}),
    },
    isBase64Encoded: isBinary,
    body: body.length
      ? isBinary
        ? body.toString('base64')
        : body.toString('utf8')
      : undefined,
  };
}

export function writeResult(
  res: ServerResponse,
  result: APIGatewayProxyStructuredResultV2,
): void {
  res.statusCode = result.statusCode ?? 200;
  for (const [k, v] of Object.entries(result.headers ?? {})) {
    if (v != null) res.setHeader(k, String(v));
  }
  res.end(
    result.isBase64Encoded && result.body
      ? Buffer.from(result.body, 'base64')
      : (result.body ?? ''),
  );
}

export const fakeContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'gagnechris-local-api',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:local:0:function:gagnechris-local-api',
  memoryLimitInMB: '256',
  awsRequestId: randomUUID(),
  logGroupName: '/local/api',
  logStreamName: 'local',
  getRemainingTimeInMillis: () => 30_000,
  done: () => undefined,
  fail: () => undefined,
  succeed: () => undefined,
} as Context;

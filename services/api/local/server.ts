/**
 * Dev-only HTTP wrapper around the API Lambda handler.
 * Injects Cognito JWT claims the same way API Gateway would — handler.ts unchanged.
 *
 * Not bundled into the Lambda (CDK entry is src/handler.ts only).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { handler } from '../src/handler.js';
import { rebuildPublishedSite } from '../../publisher/src/s3-site.js';

const port = Number(process.env.LOCAL_API_PORT || 8787);

const LOCAL_CLAIMS = {
  sub: 'local-dev-user',
  email: 'local@gagnechris.com',
  'cognito:username': 'local-admin',
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildEvent(
  req: IncomingMessage,
  body: Buffer,
  rawPath: string,
): APIGatewayProxyEventV2 {
  const host = req.headers.host || `127.0.0.1:${port}`;
  const url = new URL(rawPath, `http://${host}`);
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
    queryStringParameters: Object.fromEntries(url.searchParams),
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
      authorizer: {
        jwt: {
          claims: LOCAL_CLAIMS,
          scopes: [],
        },
      },
    },
    isBase64Encoded: isBinary,
    body: body.length
      ? isBinary
        ? body.toString('base64')
        : body.toString('utf8')
      : undefined,
  };
}

function isMutatingAdminContent(method: string, path: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  const normalized = path.replace(/\/$/, '') || '/';
  return (
    normalized === '/api/admin/posts' ||
    normalized.startsWith('/api/admin/posts/') ||
    normalized === '/api/admin/resume' ||
    normalized.startsWith('/api/admin/resume/') ||
    normalized === '/api/admin/home' ||
    normalized.startsWith('/api/admin/home/')
  );
}

/** GET on a singleton seeds it on first read (resume CHR-89, home CHR-92). */
function isSeedingSingletonRead(method: string, path: string): boolean {
  const normalized = path.replace(/\/$/, '') || '/';
  return (
    method === 'GET' &&
    (normalized === '/api/admin/resume' || normalized === '/api/admin/home')
  );
}

const fakeContext = {
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

async function maybeRebuild(method: string, path: string, status: number) {
  if (status < 200 || status >= 300) return;
  if (
    !isMutatingAdminContent(method, path) &&
    !isSeedingSingletonRead(method, path)
  ) {
    return;
  }
  try {
    const result = await rebuildPublishedSite();
    console.info('[local-api] publisher rebuild', result);
  } catch (err) {
    console.error('[local-api] publisher rebuild failed', err);
  }
}

if (process.env.DATA_TABLE_NAME === 'gagnechris-prod') {
  throw new Error('Refusing to start local API against gagnechris-prod');
}

const server = createServer(async (req, res) => {
  try {
    const body = await readBody(req);
    const rawPath = req.url || '/';
    const event = buildEvent(req, body, rawPath);
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    const result = (await handler(
      event,
      fakeContext,
      () => undefined,
    )) as APIGatewayProxyStructuredResultV2;

    const status = result.statusCode ?? 200;
    // Await rebuild before responding so publish/edit callers see fresh HTML.
    await maybeRebuild(method, path, status);

    res.statusCode = status;
    for (const [k, v] of Object.entries(result.headers ?? {})) {
      if (v != null) res.setHeader(k, String(v));
    }
    res.end(result.body ?? '');
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'local_api_error', message: String(err) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(
    `[local-api] http://127.0.0.1:${port} (table=${process.env.DATA_TABLE_NAME})`,
  );
});

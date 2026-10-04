// Injects claims only when the matched route is protected, shaped for that
// route's app, so public routes still exercise the missing-auth path.
import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { handler } from '../src/handler.js';
import { isPublishRelevantAdminMutation } from '@gagnechris/data';
import { rebuildPublishedSite } from '@gagnechris/publisher/s3-site';
import { routeAuthForPath } from '../src/router.js';
import { routes } from '../src/routes.js';
import { applyLocalAuthEnv, localClaims } from './claims.js';

const port = Number(process.env.LOCAL_API_PORT || 8787);

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

  const auth = routeAuthForPath(routes, url.pathname);

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
      ...(auth
        ? {
            authorizer: {
              jwt: {
                claims: localClaims(headers.authorization, auth),
                scopes: [],
              },
            },
          }
        : {}),
    },
    isBase64Encoded: isBinary,
    body: body.length
      ? isBinary
        ? body.toString('base64')
        : body.toString('utf8')
      : undefined,
  };
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
  // Local stand-in for stream filter Keys.sk == PUBLISHED (see isPublishRelevant).
  if (!isPublishRelevantAdminMutation(method, path)) {
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

applyLocalAuthEnv();

// Local upload URLs point here, so the browser PUT is cross-origin like the
// prod PUT to the site bucket, which allows it with a CORS rule.
const MEDIA_OBJECTS_PREFIX = '/api/admin/media/objects/';

const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').startsWith(MEDIA_OBJECTS_PREFIX)) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
    }
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

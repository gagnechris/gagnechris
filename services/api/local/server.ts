// Injects claims only when the matched route is protected, shaped for that
// route's app, so public routes still exercise the missing-auth path.
import { createServer, type IncomingMessage } from 'node:http';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../src/handler.js';
import { isPublishRelevantAdminMutation } from '@gagnechris/data';
import { rebuildPublishedSite } from '@gagnechris/publisher/rebuild';
import { routeAuthForPath } from '../src/router.js';
import { routes } from '../src/routes.js';
import { applyLocalAuthEnv, localClaims } from './claims.js';
import {
  buildGatewayEvent,
  fakeContext,
  readBody,
  writeResult,
} from './gateway.js';
import { installLocalOutbox } from './outbox.js';

const port = Number(process.env.LOCAL_API_PORT || 8787);

function localEvent(req: IncomingMessage, body: Buffer) {
  const path = new URL(req.url || '/', 'http://local').pathname;
  const auth = routeAuthForPath(routes, path);
  return buildGatewayEvent(
    req,
    body,
    auth ? localClaims(req.headers.authorization, auth) : undefined,
  );
}

// One rebuild at a time: a rebuild that read the table before a publish can
// then never write after the rebuild that has it, so once a publish responds
// the site keeps the item until something else changes it.
let rebuilds: Promise<void> = Promise.resolve();

async function maybeRebuild(method: string, path: string, status: number) {
  if (status < 200 || status >= 300) return;
  // Local stand-in for stream filter Keys.sk == PUBLISHED (see isPublishRelevant).
  if (!isPublishRelevantAdminMutation(method, path)) {
    return;
  }
  rebuilds = rebuilds.then(async () => {
    try {
      const result = await rebuildPublishedSite();
      console.info('[local-api] publisher rebuild', result);
    } catch (err) {
      console.error('[local-api] publisher rebuild failed', err);
    }
  });
  await rebuilds;
}

if (process.env.DATA_TABLE_NAME === 'gagnechris-prod') {
  throw new Error('Refusing to start local API against gagnechris-prod');
}

applyLocalAuthEnv();
installLocalOutbox();

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
    const event = localEvent(req, await readBody(req));
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

    writeResult(res, result);
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

// Injects claims only when the matched route is protected, shaped for that
// route's app, so public routes still exercise the missing-auth path.
import { createServer, type IncomingMessage } from 'node:http';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../src/handler.js';
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
import { maybeRebuild, mediaCors } from './site-hooks.js';

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

if (process.env.DATA_TABLE_NAME === 'gagnechris-prod') {
  throw new Error('Refusing to start local API against gagnechris-prod');
}

applyLocalAuthEnv();
installLocalOutbox();

// Set when a front server (go-api.ts) runs the site hooks for every request.
const behindFront = process.env.LOCAL_SITE_HOOKS === 'front';

const server = createServer(async (req, res) => {
  try {
    if (!behindFront && mediaCors(req, res)) return;
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
    if (!behindFront) await maybeRebuild(method, path, status);

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

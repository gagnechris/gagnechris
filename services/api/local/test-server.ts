// The Node API as the HTTP integration suite sees it. The suite sends the
// claims API Gateway's JWT authorizer would pass as JSON in X-Test-Claims;
// they reach the handler only on protected routes, as in production. Mail
// goes to the local outbox (LOCAL_OUTBOX_FILE), never SES.
import { createServer } from 'node:http';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../src/handler.js';
import { routeAuthForPath } from '../src/router.js';
import { routes } from '../src/routes.js';
import {
  buildGatewayEvent,
  fakeContext,
  readBody,
  writeResult,
} from './gateway.js';
import { installLocalOutbox } from './outbox.js';

const TEST_CLAIMS_HEADER = 'x-test-claims';

if (!process.env.DATA_TABLE_NAME?.startsWith('gagnechris-it-')) {
  throw new Error('The test API only serves gagnechris-it-* tables');
}

installLocalOutbox();

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url || '/', 'http://test').pathname;
    const header = req.headers[TEST_CLAIMS_HEADER];
    delete req.headers[TEST_CLAIMS_HEADER];
    const claims =
      typeof header === 'string' && routeAuthForPath(routes, path)
        ? (JSON.parse(header) as Record<string, string>)
        : undefined;
    const event = buildGatewayEvent(req, await readBody(req), claims);
    const result = (await handler(
      event,
      fakeContext,
      () => undefined,
    )) as APIGatewayProxyStructuredResultV2;
    writeResult(res, result);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end();
  }
});

server.listen(Number(process.env.PORT), '127.0.0.1');

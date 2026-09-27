import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { HomeSchema, UpdateHomeRequestSchema } from '@gagnechris/shared';
import { ConflictError, NotFoundError } from '../data/errors.js';
import { HomeRepository } from './repository.js';

function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

export async function handleHomeRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  repo?: HomeRepository,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const adminHome = path.replace(/^\/api/, '');
  if (!adminHome.startsWith('/admin/home')) {
    return undefined;
  }

  const home = repo ?? new HomeRepository();

  try {
    if (adminHome === '/admin/home') {
      if (method === 'GET') {
        return json(200, HomeSchema.parse(await home.getOrCreate()));
      }
      if (method === 'PUT') {
        const body = UpdateHomeRequestSchema.parse(parseBody(event));
        return json(200, HomeSchema.parse(await home.update(body)));
      }
    }

    if (method === 'POST' && adminHome === '/admin/home/publish') {
      return json(200, HomeSchema.parse(await home.publish()));
    }

    if (method === 'POST' && adminHome === '/admin/home/unpublish') {
      return json(200, HomeSchema.parse(await home.unpublish()));
    }

    if (method === 'POST' && adminHome === '/admin/home/discard') {
      return json(200, HomeSchema.parse(await home.discard()));
    }

    return undefined;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(400, { error: 'bad_request', message: error.message });
    }
    if (error instanceof NotFoundError) {
      return json(404, { error: 'not_found', message: error.message });
    }
    if (error instanceof ConflictError) {
      return json(409, { error: 'conflict', message: error.message });
    }
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name: string }).name === 'ZodError'
    ) {
      return json(400, {
        error: 'bad_request',
        message: 'Invalid request body',
      });
    }
    throw error;
  }
}

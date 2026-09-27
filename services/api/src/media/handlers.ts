import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
} from '@gagnechris/shared';
import { ZodError } from 'zod';
import {
  createMediaUploadUrl,
  writeLocalMediaObject,
} from './storage.js';

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

function readBinaryBody(event: APIGatewayProxyEventV2): Buffer {
  if (!event.body) return Buffer.alloc(0);
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64');
  }
  return Buffer.from(event.body, 'utf8');
}

export async function handleMediaRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const adminPath = path.replace(/^\/api/, '');
  if (!adminPath.startsWith('/admin/media')) {
    return undefined;
  }

  try {
    if (method === 'POST' && adminPath === '/admin/media/upload-url') {
      const body = MediaUploadUrlRequestSchema.parse(parseBody(event));
      const result = await createMediaUploadUrl(body);
      return json(200, MediaUploadUrlResponseSchema.parse(result));
    }

    const objectMatch = /^\/admin\/media\/objects\/(.+)$/.exec(adminPath);
    if (method === 'PUT' && objectMatch) {
      if (process.env.SITE_STORAGE !== 'filesystem') {
        return json(404, {
          error: 'not_found',
          message: 'Local media PUT is only available in filesystem mode',
        });
      }
      const key = decodeURIComponent(objectMatch[1]!);
      const contentType =
        event.headers['content-type'] ?? event.headers['Content-Type'] ?? '';
      const lengthHeader =
        event.headers['content-length'] ?? event.headers['Content-Length'];
      const expectedLength = lengthHeader ? Number(lengthHeader) : NaN;
      if (!Number.isFinite(expectedLength) || expectedLength < 1) {
        return json(400, {
          error: 'bad_request',
          message: 'Content-Length required',
        });
      }
      const body = readBinaryBody(event);
      await writeLocalMediaObject(key, body, contentType, expectedLength);
      return { statusCode: 204, body: '' };
    }

    return json(404, {
      error: 'not_found',
      message: `No media route for ${method} ${path}`,
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return json(400, {
        error: 'bad_request',
        message: error instanceof Error ? error.message : 'Invalid request',
      });
    }
    throw error;
  }
}

import {
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
} from '@gagnechris/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { json } from '../http.js';
import { defineRoute, type RouteCtx, type RouteDef } from '../router.js';
import { createMediaUploadUrl, writeLocalMediaObject } from './storage.js';

function readBinaryBody(event: APIGatewayProxyEventV2): Buffer {
  if (!event.body) return Buffer.alloc(0);
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64');
  }
  return Buffer.from(event.body, 'utf8');
}

const KeyParams = z.object({ key: z.string().min(1) });

export const mediaRoutes: RouteDef[] = [
  defineRoute({
    method: 'POST',
    pattern: '/admin/media/upload-url',
    auth: 'site-admin',
    metric: 'MediaUploadUrl',
    body: MediaUploadUrlRequestSchema,
    handler: async (_ctx, { body }) => {
      const result = await createMediaUploadUrl(body);
      return json(200, MediaUploadUrlResponseSchema.parse(result));
    },
  }),
  defineRoute({
    method: 'PUT',
    pattern: '/admin/media/objects/:key+',
    auth: 'site-admin',
    metric: 'MediaPutObject',
    params: KeyParams,
    rawBody: true,
    handler: async (ctx: RouteCtx, { params }) => {
      if (process.env.SITE_STORAGE !== 'filesystem') {
        return json(404, {
          error: 'not_found',
          message: 'Local media PUT is only available in filesystem mode',
        });
      }
      const contentType =
        ctx.event.headers['content-type'] ??
        ctx.event.headers['Content-Type'] ??
        '';
      const lengthHeader =
        ctx.event.headers['content-length'] ??
        ctx.event.headers['Content-Length'];
      const expectedLength = lengthHeader ? Number(lengthHeader) : NaN;
      if (!Number.isFinite(expectedLength) || expectedLength < 1) {
        return json(400, {
          error: 'bad_request',
          message: 'Content-Length required',
        });
      }
      const body = readBinaryBody(ctx.event);
      await writeLocalMediaObject(
        params.key,
        body,
        contentType,
        expectedLength,
      );
      return { statusCode: 204, body: '' };
    },
  }),
];

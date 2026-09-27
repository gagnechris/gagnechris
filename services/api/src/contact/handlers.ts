import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  ContactRequestSchema,
  ContactResponseSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
} from '@gagnechris/shared';
import { ZodError } from 'zod';
import { sendOwnerEmail } from './mail.js';

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

export async function handleContactRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const normalized = path.replace(/^\/api/, '') || '/';

  if (method === 'POST' && normalized === '/contact') {
    try {
      const body = ContactRequestSchema.parse(parseBody(event));
      if (body.website.trim().length > 0) {
        // Honeypot triggered — pretend success without sending.
        return json(200, ContactResponseSchema.parse({ ok: true }));
      }
      const apex = process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';
      await sendOwnerEmail({
        subject: `[${apex}] Contact from ${body.name}`,
        replyTo: body.email,
        textBody: [
          `Name: ${body.name}`,
          `Email: ${body.email}`,
          '',
          body.message,
        ].join('\n'),
      });
      return json(200, ContactResponseSchema.parse({ ok: true }));
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

  if (method === 'POST' && normalized === '/resume/download') {
    try {
      const body = ResumeDownloadNotifyRequestSchema.parse(parseBody(event));
      const apex = process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';
      const ua =
        event.headers['user-agent'] ?? event.headers['User-Agent'] ?? '';
      await sendOwnerEmail({
        subject: `[${apex}] Resume downloaded`,
        textBody: [
          `A visitor downloaded the resume PDF.`,
          `Time: ${new Date().toISOString()}`,
          `Referrer: ${body.referrer || '(none)'}`,
          `User-Agent: ${ua || '(none)'}`,
        ].join('\n'),
      });
      return json(200, ResumeDownloadNotifyResponseSchema.parse({ ok: true }));
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

  return undefined;
}

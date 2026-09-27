import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ContactRequestSchema,
  ContactResponseSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
} from '@gagnechris/shared';
import { sendOwnerEmail } from './mail.js';
import { ContactRepository } from './repository.js';
import {
  RateLimitExceededError,
  RateLimiter,
} from './rateLimit.js';
import {
  isZodError,
  json,
  mapRouteError,
  parseBody,
  zodBadRequest,
} from '../http.js';

const logger = new Logger({ serviceName: 'gagnechris-api' });
const metrics = new Metrics({
  namespace: 'gagnechris',
  serviceName: 'gagnechris-api',
});

/** Minimum ms between form open and submit (bots often submit instantly). */
export const MIN_CONTACT_SUBMIT_MS = 2_000;

function sourceIp(event: APIGatewayProxyEventV2): string {
  return event.requestContext?.http?.sourceIp?.trim() || 'unknown';
}

function honeypotTriggered(body: {
  hp_field: string;
  website: string;
}): boolean {
  return body.hp_field.trim().length > 0 || body.website.trim().length > 0;
}

/**
 * Best-effort anti-bot timing (CHR-114 / CHR-122).
 *
 * `elapsedMs` is client-controlled — a bot can omit it or send a large value
 * and skip this check. IP + SES rate limits remain the hard caps. A signed
 * server-issued token would make this authoritative if spam ever warrants it.
 */
function tooFastSubmit(body: {
  elapsedMs?: number;
  formStartedAt?: number;
}): boolean {
  // Prefer client-measured duration (no clock skew across machines).
  if (body.elapsedMs !== undefined) {
    return body.elapsedMs < MIN_CONTACT_SUBMIT_MS;
  }
  // Legacy clients: best-effort using formStartedAt vs server clock.
  if (body.formStartedAt === undefined) return false;
  const elapsed = Date.now() - body.formStartedAt;
  return elapsed >= 0 && elapsed < MIN_CONTACT_SUBMIT_MS;
}

async function tryUpdateEmailStatus(
  contacts: ContactRepository,
  contactId: string,
  status: 'sent' | 'failed',
  emailError?: string,
): Promise<void> {
  try {
    await contacts.updateEmailStatus(contactId, status, emailError);
  } catch (error) {
    logger.warn('Contact emailStatus update failed', {
      contactId,
      status,
      err: error,
    });
    metrics.addMetric('ContactEmailStatusUpdateFailed', MetricUnit.Count, 1);
    metrics.publishStoredMetrics();
  }
}

export type ContactHandlerDeps = {
  contacts?: ContactRepository;
  rates?: RateLimiter;
  sendEmail?: typeof sendOwnerEmail;
};

export async function handleContactRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  deps: ContactHandlerDeps = {},
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const normalized = path.replace(/^\/api/, '') || '/';
  const getContacts = () => deps.contacts ?? new ContactRepository();
  const getRates = () => deps.rates ?? new RateLimiter();
  const sendEmail = deps.sendEmail ?? sendOwnerEmail;

  if (method === 'POST' && normalized === '/contact') {
    try {
      const body = ContactRequestSchema.parse(parseBody(event));
      if (honeypotTriggered(body) || tooFastSubmit(body)) {
        // Spam / autofill trap — pretend success without persisting or sending.
        return json(200, ContactResponseSchema.parse({ ok: true }));
      }

      const contacts = getContacts();
      const rates = getRates();
      const ip = sourceIp(event);
      await rates.consumeContactIp(ip);

      const saved = await contacts.save({
        name: body.name,
        email: body.email,
        message: body.message,
        sourceIp: ip,
      });

      try {
        await rates.consumeSesSend();
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          await tryUpdateEmailStatus(
            contacts,
            saved.contactId,
            'failed',
            error.message,
          );
          return json(429, {
            error: 'rate_limited',
            message: error.message,
          });
        }
        throw error;
      }

      const apex = process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';
      try {
        await sendEmail({
          subject: `[${apex}] Contact from ${body.name}`,
          replyTo: body.email,
          textBody: [
            `Name: ${body.name}`,
            `Email: ${body.email}`,
            `ContactId: ${saved.contactId}`,
            '',
            body.message,
          ].join('\n'),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Email send failed';
        await tryUpdateEmailStatus(
          contacts,
          saved.contactId,
          'failed',
          message,
        );
        return json(502, {
          error: 'email_failed',
          message:
            'Your message was saved but email delivery failed. Please try again later.',
        });
      }

      // SES succeeded — never fail the visitor if Dynamo status update fails.
      await tryUpdateEmailStatus(contacts, saved.contactId, 'sent');

      return json(200, ContactResponseSchema.parse({ ok: true }));
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return json(429, {
          error: 'rate_limited',
          message: error.message,
        });
      }
      if (isZodError(error)) {
        return zodBadRequest(error, 'Invalid request body');
      }
      const mapped = mapRouteError(error);
      if (mapped) return mapped;
      throw error;
    }
  }

  if (method === 'POST' && normalized === '/resume/download') {
    try {
      const body = ResumeDownloadNotifyRequestSchema.parse(parseBody(event));
      const rates = getRates();
      const ip = sourceIp(event);
      const firstToday = await rates.claimResumeNotifyIp(ip);
      if (!firstToday) {
        // Already notified for this IP today — succeed without another SES send.
        return json(200, ResumeDownloadNotifyResponseSchema.parse({ ok: true }));
      }

      try {
        await rates.consumeSesSend();
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          // Dedupe already claimed; skip email quietly under global cap.
          return json(200, ResumeDownloadNotifyResponseSchema.parse({ ok: true }));
        }
        throw error;
      }

      const apex = process.env.SITE_APEX_DOMAIN?.trim() || 'gagnechris.com';
      const ua =
        event.headers['user-agent'] ?? event.headers['User-Agent'] ?? '';
      try {
        await sendEmail({
          subject: `[${apex}] Resume downloaded`,
          textBody: [
            `A visitor downloaded the resume PDF.`,
            `Time: ${new Date().toISOString()}`,
            `Referrer: ${body.referrer || '(none)'}`,
            `User-Agent: ${ua || '(none)'}`,
          ].join('\n'),
        });
      } catch {
        // Resume notify is best-effort; download already happened client-side.
        return json(200, ResumeDownloadNotifyResponseSchema.parse({ ok: true }));
      }
      return json(200, ResumeDownloadNotifyResponseSchema.parse({ ok: true }));
    } catch (error) {
      if (isZodError(error)) {
        return zodBadRequest(error, 'Invalid request');
      }
      const mapped = mapRouteError(error);
      if (mapped) return mapped;
      throw error;
    }
  }

  return undefined;
}

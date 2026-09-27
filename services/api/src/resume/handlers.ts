import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ResumeSchema, UpdateResumeRequestSchema } from '@gagnechris/shared';
import { ConflictError, NotFoundError } from '../data/errors.js';
import { ResumeRepository } from './repository.js';

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

export async function handleResumeRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  repo?: ResumeRepository,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const adminResume = path.replace(/^\/api/, '');
  if (!adminResume.startsWith('/admin/resume')) {
    return undefined;
  }

  const resume = repo ?? new ResumeRepository();

  try {
    if (adminResume === '/admin/resume') {
      if (method === 'GET') {
        return json(200, ResumeSchema.parse(await resume.getOrCreate()));
      }
      if (method === 'PUT') {
        const body = UpdateResumeRequestSchema.parse(parseBody(event));
        return json(200, ResumeSchema.parse(await resume.update(body)));
      }
    }

    if (method === 'POST' && adminResume === '/admin/resume/publish') {
      return json(200, ResumeSchema.parse(await resume.publish()));
    }

    if (method === 'POST' && adminResume === '/admin/resume/unpublish') {
      return json(200, ResumeSchema.parse(await resume.unpublish()));
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

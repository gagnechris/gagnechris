import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import { handleResumeRoute } from '../src/resume/handlers.js';
import { ConflictError } from '../src/data/errors.js';
import { ResumeRepository } from '../src/resume/repository.js';

function event(
  method: string,
  path: string,
  body?: unknown,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: 'now',
      timeEpoch: Date.now(),
    },
  } as APIGatewayProxyEventV2;
}

const sampleResume: Resume = {
  ...DEFAULT_RESUME,
  status: 'published',
  publishedAt: '2026-09-27T01:00:00.000Z',
  updatedAt: '2026-09-27T01:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

describe('resume HTTP handlers', () => {
  const repo = {
    get: vi.fn(),
    getOrCreate: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
  } as unknown as ResumeRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores routes outside /admin/resume', async () => {
    const result = await handleResumeRoute(
      event('GET', '/api/admin/posts'),
      'GET',
      '/api/admin/posts',
      repo,
    );
    expect(result).toBeUndefined();
  });

  it('gets (seeding) the resume', async () => {
    vi.mocked(repo.getOrCreate).mockResolvedValue(sampleResume);
    const result = await handleResumeRoute(
      event('GET', '/api/admin/resume'),
      'GET',
      '/api/admin/resume',
      repo,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body as string).name).toBe('Chris Gagne');
  });

  it('updates with the expected version', async () => {
    vi.mocked(repo.update).mockResolvedValue({ ...sampleResume, version: 2 });
    const result = await handleResumeRoute(
      event('PUT', '/api/admin/resume', {
        version: 1,
  hasUnpublishedChanges: false,
        name: 'Chris Gagne',
        content: sampleResume.content,
      }),
      'PUT',
      '/api/admin/resume',
      repo,
    );
    expect(result?.statusCode).toBe(200);
    expect(vi.mocked(repo.update).mock.calls[0]![0]!.version).toBe(1);
  });

  it('rejects an update body without a version', async () => {
    const result = await handleResumeRoute(
      event('PUT', '/api/admin/resume', { name: 'Chris' }),
      'PUT',
      '/api/admin/resume',
      repo,
    );
    expect(result?.statusCode).toBe(400);
    expect(vi.mocked(repo.update)).not.toHaveBeenCalled();
  });

  it('returns 409 on a version conflict', async () => {
    vi.mocked(repo.update).mockRejectedValue(new ConflictError('stale'));
    const result = await handleResumeRoute(
      event('PUT', '/api/admin/resume', { version: 1 }),
      'PUT',
      '/api/admin/resume',
      repo,
    );
    expect(result?.statusCode).toBe(409);
  });

  it('publishes and unpublishes', async () => {
    vi.mocked(repo.publish).mockResolvedValue(sampleResume);
    vi.mocked(repo.unpublish).mockResolvedValue({
      ...sampleResume,
      status: 'draft',
      version: 2,
  hasUnpublishedChanges: false,
    });

    const published = await handleResumeRoute(
      event('POST', '/api/admin/resume/publish'),
      'POST',
      '/api/admin/resume/publish',
      repo,
    );
    expect(published?.statusCode).toBe(200);
    expect(JSON.parse(published!.body as string).status).toBe('published');

    const unpublished = await handleResumeRoute(
      event('POST', '/api/admin/resume/unpublish'),
      'POST',
      '/api/admin/resume/unpublish',
      repo,
    );
    expect(unpublished?.statusCode).toBe(200);
    expect(JSON.parse(unpublished!.body as string).status).toBe('draft');
    expect(JSON.parse(unpublished!.body as string).publishedAt).toBe(
      sampleResume.publishedAt,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DEFAULT_HOME, type Home } from '@gagnechris/shared';
import { handleHomeRoute } from '../src/home/handlers.js';
import { ConflictError } from '../src/data/errors.js';
import { HomeRepository } from '../src/home/repository.js';

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

const sampleHome: Home = {
  ...DEFAULT_HOME,
  status: 'published',
  publishedAt: '2026-09-27T01:00:00.000Z',
  updatedAt: '2026-09-27T01:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

describe('home HTTP handlers', () => {
  const repo = {
    get: vi.fn(),
    getOrCreate: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
  } as unknown as HomeRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores routes outside /admin/home', async () => {
    const result = await handleHomeRoute(
      event('GET', '/api/admin/resume'),
      'GET',
      '/api/admin/resume',
      repo,
    );
    expect(result).toBeUndefined();
  });

  it('gets (seeding) the home content', async () => {
    vi.mocked(repo.getOrCreate).mockResolvedValue(sampleHome);
    const result = await handleHomeRoute(
      event('GET', '/api/admin/home'),
      'GET',
      '/api/admin/home',
      repo,
    );
    expect(result?.statusCode).toBe(200);
    const body = JSON.parse(result!.body as string);
    expect(body.name).toBe('Chris Gagne');
    expect(body.title).toBe('Engineering Leader');
  });

  it('updates with the expected version', async () => {
    vi.mocked(repo.update).mockResolvedValue({ ...sampleHome, version: 2 });
    const result = await handleHomeRoute(
      event('PUT', '/api/admin/home', {
        version: 1,
  hasUnpublishedChanges: false,
        name: 'Chris Gagne',
        about: 'New about copy.',
      }),
      'PUT',
      '/api/admin/home',
      repo,
    );
    expect(result?.statusCode).toBe(200);
    expect(vi.mocked(repo.update).mock.calls[0]![0]!.about).toBe(
      'New about copy.',
    );
  });

  it('rejects an update body without a version', async () => {
    const result = await handleHomeRoute(
      event('PUT', '/api/admin/home', { name: 'Chris' }),
      'PUT',
      '/api/admin/home',
      repo,
    );
    expect(result?.statusCode).toBe(400);
    expect(vi.mocked(repo.update)).not.toHaveBeenCalled();
  });

  it('returns 409 on a version conflict', async () => {
    vi.mocked(repo.update).mockRejectedValue(new ConflictError('stale'));
    const result = await handleHomeRoute(
      event('PUT', '/api/admin/home', { version: 1 }),
      'PUT',
      '/api/admin/home',
      repo,
    );
    expect(result?.statusCode).toBe(409);
  });

  it('publishes and unpublishes', async () => {
    vi.mocked(repo.publish).mockResolvedValue(sampleHome);
    vi.mocked(repo.unpublish).mockResolvedValue({
      ...sampleHome,
      status: 'draft',
      version: 2,
  hasUnpublishedChanges: false,
    });

    const published = await handleHomeRoute(
      event('POST', '/api/admin/home/publish', { version: 1 }),
      'POST',
      '/api/admin/home/publish',
      repo,
    );
    expect(published?.statusCode).toBe(200);
    expect(JSON.parse(published!.body as string).status).toBe('published');

    const unpublished = await handleHomeRoute(
      event('POST', '/api/admin/home/unpublish', { version: 1 }),
      'POST',
      '/api/admin/home/unpublish',
      repo,
    );
    expect(unpublished?.statusCode).toBe(200);
    expect(JSON.parse(unpublished!.body as string).status).toBe('draft');
    expect(JSON.parse(unpublished!.body as string).publishedAt).toBe(
      sampleHome.publishedAt,
    );
  });
});

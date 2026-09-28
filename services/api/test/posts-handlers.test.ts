import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Post } from '@gagnechris/shared';
import { handlePostsRoute } from '../src/posts/handlers.js';
import {
  ConflictError,
  NotFoundError,
  PostsRepository,
} from '../src/posts/repository.js';

function event(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    queryStringParameters: query,
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

const samplePost: Post = {
  id: '01TESTPOSTID00000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '# hi',
  tags: ['aws'],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T01:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

describe('posts HTTP handlers', () => {
  const repo = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as PostsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists posts', async () => {
    vi.mocked(repo.list).mockResolvedValue({ items: [samplePost] });
    const result = await handlePostsRoute(
      event('GET', '/api/admin/posts'),
      'GET',
      '/api/admin/posts',
      repo,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body as string).items).toHaveLength(1);
  });

  it('creates a draft', async () => {
    vi.mocked(repo.create).mockResolvedValue(samplePost);
    const result = await handlePostsRoute(
      event('POST', '/api/admin/posts', { title: 'Hello' }),
      'POST',
      '/api/admin/posts',
      repo,
    );
    expect(result?.statusCode).toBe(201);
  });

  it('returns 409 on conflict', async () => {
    vi.mocked(repo.create).mockRejectedValue(new ConflictError('taken'));
    const result = await handlePostsRoute(
      event('POST', '/api/admin/posts', { title: 'Hello', slug: 'hello' }),
      'POST',
      '/api/admin/posts',
      repo,
    );
    expect(result?.statusCode).toBe(409);
  });

  it('publishes and soft-deletes', async () => {
    vi.mocked(repo.publish).mockResolvedValue({
      ...samplePost,
      status: 'published',
      publishedAt: samplePost.updatedAt,
      version: 2,
      hasUnpublishedChanges: false,
    });
    vi.mocked(repo.softDelete).mockRejectedValue(
      new NotFoundError('Post missing'),
    );

    const published = await handlePostsRoute(
      event('POST', `/api/admin/posts/${samplePost.id}/publish`, {
        version: 1,
      }),
      'POST',
      `/api/admin/posts/${samplePost.id}/publish`,
      repo,
    );
    expect(published?.statusCode).toBe(200);

    const deleted = await handlePostsRoute(
      event('DELETE', `/api/admin/posts/${samplePost.id}`, { version: 1 }),
      'DELETE',
      `/api/admin/posts/${samplePost.id}`,
      repo,
    );
    expect(deleted?.statusCode).toBe(404);
  });
});

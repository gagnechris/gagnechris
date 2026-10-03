import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Post } from '@gagnechris/shared';
import { createPostRoutes } from '../src/posts/handlers.js';
import {
  ConflictError,
  NotFoundError,
  PostsRepository,
} from '../src/posts/repository.js';
import { DataIntegrityError } from '../src/data/errors.js';
import { dispatchRoutes } from '../src/router.js';
import { makeEvent } from './support/make-event.js';

const ADMIN = { sub: 'admin-1' };

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

  async function dispatch(
    method: string,
    path: string,
    opts?: Parameters<typeof makeEvent>[2],
  ) {
    return dispatchRoutes(
      createPostRoutes(repo),
      makeEvent(method, path, { jwtClaims: ADMIN, ...opts }),
      method,
      path,
    );
  }

  it('lists posts', async () => {
    vi.mocked(repo.list).mockResolvedValue({ items: [samplePost] });
    const result = await dispatch('GET', '/api/admin/posts');
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string).items).toHaveLength(1);
  });

  it('creates a draft', async () => {
    vi.mocked(repo.create).mockResolvedValue(samplePost);
    const result = await dispatch('POST', '/api/admin/posts', {
      body: { title: 'Hello' },
    });
    expect(result.statusCode).toBe(201);
  });

  it('returns 500 data_integrity for corrupt PUBLISHED', async () => {
    vi.mocked(repo.getById).mockRejectedValue(
      new DataIntegrityError('Corrupt stored Post', {
        pk: `POST#${samplePost.id}`,
        sk: 'PUBLISHED',
      }),
    );
    const result = await dispatch('GET', `/api/admin/posts/${samplePost.id}`);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body as string)).toMatchObject({
      error: 'data_integrity',
    });
  });

  it('returns 409 on conflict', async () => {
    vi.mocked(repo.create).mockRejectedValue(new ConflictError('taken'));
    const result = await dispatch('POST', '/api/admin/posts', {
      body: { title: 'Hello', slug: 'hello' },
    });
    expect(result.statusCode).toBe(409);
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

    const published = await dispatch(
      'POST',
      `/api/admin/posts/${samplePost.id}/publish`,
      { body: { version: 1 } },
    );
    expect(published.statusCode).toBe(200);

    const deleted = await dispatch(
      'DELETE',
      `/api/admin/posts/${samplePost.id}`,
      { body: { version: 1 } },
    );
    expect(deleted.statusCode).toBe(404);
  });
});

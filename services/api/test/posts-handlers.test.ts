import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Post } from '@gagnechris/shared';
import { handlePostsRoute } from '../src/posts/handlers.js';
import {
  ConflictError,
  NotFoundError,
  PostsRepository,
} from '../src/posts/repository.js';
import { makeEvent } from './support/make-event.js';

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
      makeEvent('GET', '/api/admin/posts'),
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
      makeEvent('POST', '/api/admin/posts', { body: { title: 'Hello' } }),
      'POST',
      '/api/admin/posts',
      repo,
    );
    expect(result?.statusCode).toBe(201);
  });

  it('returns 409 on conflict', async () => {
    vi.mocked(repo.create).mockRejectedValue(new ConflictError('taken'));
    const result = await handlePostsRoute(
      makeEvent('POST', '/api/admin/posts', {
        body: { title: 'Hello', slug: 'hello' },
      }),
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
      makeEvent('POST', `/api/admin/posts/${samplePost.id}/publish`, {
        body: { version: 1 },
      }),
      'POST',
      `/api/admin/posts/${samplePost.id}/publish`,
      repo,
    );
    expect(published?.statusCode).toBe(200);

    const deleted = await handlePostsRoute(
      makeEvent('DELETE', `/api/admin/posts/${samplePost.id}`, {
        body: { version: 1 },
      }),
      'DELETE',
      `/api/admin/posts/${samplePost.id}`,
      repo,
    );
    expect(deleted?.statusCode).toBe(404);
  });
});

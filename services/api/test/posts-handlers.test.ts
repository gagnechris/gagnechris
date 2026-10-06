import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Post } from '@gagnechris/shared';
import { createPostRoutes } from '../src/posts/handlers.js';
import type { PostsRepository } from '../src/posts/repository.js';
import {
  ConflictError,
  DataIntegrityError,
  NotFoundError,
} from '../src/data/errors.js';
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
  projectIds: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T01:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

describe('posts HTTP handlers', () => {
  const projectsRepo = { existingIds: vi.fn() };
  const repo = {
    list: vi.fn(),
    counts: vi.fn(),
    getById: vi.fn(),
    getByIdOrThrow: vi.fn(),
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
      createPostRoutes(repo, projectsRepo),
      makeEvent(method, path, { jwtClaims: ADMIN, ...opts }),
      method,
      path,
    );
  }

  it('lists summary rows, 50 to a page by default', async () => {
    vi.mocked(repo.list).mockResolvedValue({ items: [samplePost] });
    vi.mocked(repo.counts).mockResolvedValue({
      all: 1,
      draft: 1,
      published: 0,
    });
    const result = await dispatch('GET', '/api/admin/posts');
    expect(result.statusCode).toBe(200);
    const [row] = JSON.parse(result.body as string).items;
    expect(row).toMatchObject({ id: samplePost.id, title: 'Hello' });
    expect(row).not.toHaveProperty('bodyMarkdown');
    expect(row).not.toHaveProperty('seo');
    expect(repo.list).toHaveBeenCalledWith(undefined, {
      cursor: undefined,
      limit: 50,
      q: undefined,
    });
  });

  it('passes q and status through and returns counts on the first page only', async () => {
    vi.mocked(repo.list).mockResolvedValue({ items: [samplePost] });
    const counts = { all: 3, draft: 1, published: 2 };
    vi.mocked(repo.counts).mockResolvedValue(counts);

    const first = await dispatch('GET', '/api/admin/posts', {
      query: { q: '  aws ', status: 'draft' },
    });
    expect(JSON.parse(first.body as string).counts).toEqual(counts);
    expect(repo.list).toHaveBeenCalledWith('draft', {
      cursor: undefined,
      limit: 50,
      q: 'aws',
    });

    const next = await dispatch('GET', '/api/admin/posts', {
      query: { cursor: 'abc' },
    });
    expect(JSON.parse(next.body as string)).not.toHaveProperty('counts');
    expect(repo.counts).toHaveBeenCalledTimes(1);
  });

  it('rejects an over-long q', async () => {
    const result = await dispatch('GET', '/api/admin/posts', {
      query: { q: 'x'.repeat(201) },
    });
    expect(result.statusCode).toBe(400);
  });

  describe('projectIds', () => {
    const known = '01PROJECTKNOWN000000000000';
    const unknown = '01PROJECTUNKNOWN0000000000';

    beforeEach(() => {
      projectsRepo.existingIds.mockImplementation(
        async (ids: string[]) => new Set(ids.filter((id) => id === known)),
      );
    });

    it('rejects an unknown project id with 400 on create and update', async () => {
      for (const [method, path] of [
        ['POST', '/api/admin/posts'],
        ['PUT', `/api/admin/posts/${samplePost.id}`],
      ] as const) {
        vi.mocked(repo.getById).mockResolvedValue(samplePost);
        const result = await dispatch(method, path, {
          body: { version: 1, title: 'Hello', projectIds: [known, unknown] },
        });
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body as string)).toMatchObject({
          error: 'bad_request',
          fields: { projectIds: 'unknown_project' },
        });
      }
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('accepts existing project ids', async () => {
      vi.mocked(repo.update).mockResolvedValue({
        ...samplePost,
        projectIds: [known],
      });
      vi.mocked(repo.getById).mockResolvedValue(samplePost);
      const result = await dispatch(
        'PUT',
        `/api/admin/posts/${samplePost.id}`,
        {
          body: { version: 1, projectIds: [known] },
        },
      );
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string).projectIds).toEqual([known]);
    });

    it('a tag already on the post saves after its project is deleted', async () => {
      vi.mocked(repo.getById).mockResolvedValue({
        ...samplePost,
        projectIds: [unknown],
      });
      vi.mocked(repo.update).mockResolvedValue(samplePost);
      const result = await dispatch(
        'PUT',
        `/api/admin/posts/${samplePost.id}`,
        {
          body: { version: 1, projectIds: [unknown] },
        },
      );
      expect(result.statusCode).toBe(200);
    });
  });

  it('creates a draft', async () => {
    vi.mocked(repo.create).mockResolvedValue(samplePost);
    const result = await dispatch('POST', '/api/admin/posts', {
      body: { title: 'Hello' },
    });
    expect(result.statusCode).toBe(201);
  });

  it('returns 500 data_integrity for corrupt PUBLISHED', async () => {
    vi.mocked(repo.getByIdOrThrow).mockRejectedValue(
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

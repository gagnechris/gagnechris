import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ConflictError } from '../../src/data/errors.js';
import { makeEvent } from './make-event.js';

type RouteResult = { statusCode?: number; body?: string } | undefined;

type MockPublishableRepo = {
  get: ReturnType<typeof vi.fn>;
  getOrCreate: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  unpublish: ReturnType<typeof vi.fn>;
  discard: ReturnType<typeof vi.fn>;
};

export type PublishableHandlerSuiteOptions<
  TSample extends {
    version: number;
    publishedAt: string | null;
    status: string;
  },
> = {
  label: string;
  foreignMethod: string;
  foreignPath: string;
  basePath: string;
  sample: TSample;
  updateBody: Record<string, unknown>;
  assertGetBody: (body: Record<string, unknown>) => void;
  assertUpdateInput: (input: Record<string, unknown>) => void;
  handleRoute: (
    event: APIGatewayProxyEventV2,
    method: string,
    path: string,
    repo: MockPublishableRepo,
  ) => Promise<RouteResult>;
  createRepo: () => MockPublishableRepo;
};

export function definePublishableHandlerTests<
  TSample extends {
    version: number;
    publishedAt: string | null;
    status: string;
  },
>(opts: PublishableHandlerSuiteOptions<TSample>): void {
  describe(`${opts.label} HTTP handlers`, () => {
    let repo: MockPublishableRepo;

    beforeEach(() => {
      repo = opts.createRepo();
      vi.clearAllMocks();
    });

    it('ignores routes outside the admin path', async () => {
      const result = await opts.handleRoute(
        makeEvent(opts.foreignMethod, opts.foreignPath),
        opts.foreignMethod,
        opts.foreignPath,
        repo,
      );
      expect(result).toBeUndefined();
    });

    it('gets (seeding) content', async () => {
      vi.mocked(repo.getOrCreate).mockResolvedValue(opts.sample);
      const result = await opts.handleRoute(
        makeEvent('GET', opts.basePath),
        'GET',
        opts.basePath,
        repo,
      );
      expect(result?.statusCode).toBe(200);
      opts.assertGetBody(JSON.parse(result!.body as string));
    });

    it('updates with the expected version', async () => {
      vi.mocked(repo.update).mockResolvedValue({
        ...opts.sample,
        version: opts.sample.version + 1,
      });
      const result = await opts.handleRoute(
        makeEvent('PUT', opts.basePath, { body: opts.updateBody }),
        'PUT',
        opts.basePath,
        repo,
      );
      expect(result?.statusCode).toBe(200);
      opts.assertUpdateInput(vi.mocked(repo.update).mock.calls[0]![0]!);
    });

    it('rejects an update body without a version', async () => {
      const { version: _v, ...withoutVersion } = opts.updateBody;
      const result = await opts.handleRoute(
        makeEvent('PUT', opts.basePath, { body: withoutVersion }),
        'PUT',
        opts.basePath,
        repo,
      );
      expect(result?.statusCode).toBe(400);
      expect(vi.mocked(repo.update)).not.toHaveBeenCalled();
    });

    it('returns 409 on a version conflict', async () => {
      vi.mocked(repo.update).mockRejectedValue(new ConflictError('stale'));
      const result = await opts.handleRoute(
        makeEvent('PUT', opts.basePath, {
          body: { version: opts.sample.version },
        }),
        'PUT',
        opts.basePath,
        repo,
      );
      expect(result?.statusCode).toBe(409);
    });

    it('publishes and unpublishes', async () => {
      vi.mocked(repo.publish).mockResolvedValue(opts.sample);
      vi.mocked(repo.unpublish).mockResolvedValue({
        ...opts.sample,
        status: 'draft',
        version: opts.sample.version + 1,
        hasUnpublishedChanges: false,
      });

      const published = await opts.handleRoute(
        makeEvent('POST', `${opts.basePath}/publish`, {
          body: { version: opts.sample.version },
        }),
        'POST',
        `${opts.basePath}/publish`,
        repo,
      );
      expect(published?.statusCode).toBe(200);
      expect(JSON.parse(published!.body as string).status).toBe('published');

      const unpublished = await opts.handleRoute(
        makeEvent('POST', `${opts.basePath}/unpublish`, {
          body: { version: opts.sample.version },
        }),
        'POST',
        `${opts.basePath}/unpublish`,
        repo,
      );
      expect(unpublished?.statusCode).toBe(200);
      expect(JSON.parse(unpublished!.body as string).status).toBe('draft');
      expect(JSON.parse(unpublished!.body as string).publishedAt).toBe(
        opts.sample.publishedAt,
      );
    });
  });
}

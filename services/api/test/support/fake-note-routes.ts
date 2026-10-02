/**
 * Test-only Notebook mutation routes that exercise If-Match / ETag (CHR-162).
 * Not registered in the prod route table — fixture-notes were removed in CHR-153.
 */
import { z } from 'zod';
import { UlidSchema } from '@gagnechris/shared';
import {
  mapVersionConflict,
  resolveExpectedVersion,
} from '../../src/data/concurrency.js';
import { NotFoundError } from '../../src/data/errors.js';
import { json, jsonWithEtag } from '../../src/http.js';
import { defineRoute, type RouteDef } from '../../src/router.js';
import {
  buildFakeNote,
  createFakeNotesRepo,
  type FakeNote,
} from './fake-note.js';

const IdParams = z.object({ id: UlidSchema });

const UpdateBodySchema = z.object({
  version: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

const DeleteBodySchema = z.object({
  version: z.number().int().nonnegative().optional(),
});

function noteResponse(note: FakeNote) {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    body: note.body,
    version: note.version,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deleted: note.deleted,
  };
}

export function createFakeNoteRoutes(
  repo: ReturnType<typeof createFakeNotesRepo>,
): RouteDef[] {
  return [
    defineRoute({
      method: 'POST',
      pattern: '/notebook/test-notes',
      auth: 'admin',
      metric: 'CreateTestNote',
      body: z.object({
        id: UlidSchema,
        title: z.string().default(''),
        body: z.string().default(''),
      }),
      handler: async (ctx, { body }) => {
        const now = new Date().toISOString();
        const note = await repo.createIdempotent(
          buildFakeNote(ctx.userId!, body.id, body, now),
        );
        return jsonWithEtag(201, noteResponse(note), note.version);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/test-notes/:id',
      auth: 'admin',
      metric: 'GetTestNote',
      params: IdParams,
      handler: async (_ctx, { params }) => {
        const note = await repo.get(params.id);
        if (!note) {
          throw new NotFoundError(`fake note ${params.id} not found`);
        }
        return jsonWithEtag(200, noteResponse(note), note.version);
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/test-notes/:id',
      auth: 'admin',
      metric: 'UpdateTestNote',
      params: IdParams,
      body: UpdateBodySchema,
      handler: async (ctx, { params, body }) => {
        const { expected, fromIfMatch } = resolveExpectedVersion(
          ctx.event,
          body,
        );
        if (expected === undefined) {
          return json(400, {
            error: 'bad_request',
            message: 'Expected version required (If-Match or body.version)',
          });
        }
        const existing = await repo.getOrThrow(params.id);
        const version =
          expected === 'any' ? existing.version : (expected as number);
        const now = new Date().toISOString();
        try {
          const next = await repo.updateIfVersion(params.id, version, {
            ...existing,
            title: body.title ?? existing.title,
            body: body.body ?? existing.body,
            version: existing.version + 1,
            updatedAt: now,
          });
          return jsonWithEtag(200, noteResponse(next), next.version);
        } catch (error) {
          mapVersionConflict(error, fromIfMatch);
        }
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/notebook/test-notes/:id',
      auth: 'admin',
      metric: 'DeleteTestNote',
      params: IdParams,
      body: DeleteBodySchema,
      handler: async (ctx, { params, body }) => {
        const { expected, fromIfMatch } = resolveExpectedVersion(
          ctx.event,
          body,
        );
        if (expected === undefined) {
          return json(400, {
            error: 'bad_request',
            message: 'Expected version required (If-Match or body.version)',
          });
        }
        const existing = await repo.getOrThrow(params.id);
        const version =
          expected === 'any' ? existing.version : (expected as number);
        const now = new Date().toISOString();
        try {
          const tombstone = await repo.softDelete(params.id, version, {
            ...existing,
            version: existing.version + 1,
            updatedAt: now,
            deleted: true,
          });
          return jsonWithEtag(200, noteResponse(tombstone), tombstone.version);
        } catch (error) {
          mapVersionConflict(error, fromIfMatch);
        }
      },
    }),
  ];
}

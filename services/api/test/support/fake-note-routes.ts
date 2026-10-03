/**
 * Test-only Notebook mutation routes that exercise If-Match / ETag (CHR-162 / CHR-171).
 * Not registered in the prod route table.
 */
import { z } from 'zod';
import { UlidSchema } from '@gagnechris/shared';
import { defineRoute, type RouteDef } from '../../src/router.js';
import {
  jsonEntity,
  versionedMutationRoute,
} from '../../src/data/versioned-route.js';
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
    area: note.area,
    noteDate: note.noteDate,
  };
}

export function createFakeNoteRoutes(
  repo: ReturnType<typeof createFakeNotesRepo>,
  now: () => string = () => new Date().toISOString(),
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
        area: z.enum(['work', 'personal']).optional(),
        noteDate: z.string().optional(),
      }),
      handler: async (ctx, { body }) => {
        const note = await repo.createIdempotent(
          buildFakeNote(ctx.userId!, body.id, body, now()),
        );
        return jsonEntity(201, note, noteResponse);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/test-notes/:id',
      auth: 'admin',
      metric: 'GetTestNote',
      params: IdParams,
      handler: async (ctx, { params }) => {
        const note = await repo.getOrThrow({
          userId: ctx.userId!,
          id: params.id,
        });
        return jsonEntity(200, note, noteResponse);
      },
    }),
    versionedMutationRoute({
      method: 'PUT',
      pattern: '/notebook/test-notes/:id',
      metric: 'UpdateTestNote',
      params: IdParams,
      body: UpdateBodySchema,
      mutate: (ctx, { params, body, expected }) =>
        repo.mutateIfVersion(
          { userId: ctx.userId!, id: params.id },
          expected,
          (existing, updatedAt) => ({
            ...existing,
            title: body.title ?? existing.title,
            body: body.body ?? existing.body,
            updatedAt,
          }),
        ),
      respond: noteResponse,
    }),
    versionedMutationRoute({
      method: 'DELETE',
      pattern: '/notebook/test-notes/:id',
      metric: 'DeleteTestNote',
      params: IdParams,
      body: DeleteBodySchema,
      mutate: (ctx, { params, expected }) =>
        repo.softDeleteIfVersion(
          { userId: ctx.userId!, id: params.id },
          expected,
          (existing, updatedAt) => ({ ...existing, updatedAt, deleted: true }),
        ),
      respond: noteResponse,
    }),
  ];
}

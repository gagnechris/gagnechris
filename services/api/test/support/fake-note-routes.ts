import { z } from 'zod';
import { UlidSchema } from '@gagnechris/shared';
import { defineRoute, type RouteDef } from '../../src/router.js';
import {
  jsonEntity,
  requireExpectedVersion,
  runVersionedMutation,
  versionForWrite,
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
        const now = new Date().toISOString();
        const note = await repo.createIdempotent(
          buildFakeNote(ctx.userId!, body.id, body, now),
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
        const note = await repo.getOrThrow(ctx.userId!, params.id);
        return jsonEntity(200, note, noteResponse);
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
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await repo.getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const now = new Date().toISOString();
        const next = await runVersionedMutation(resolved.fromIfMatch, () =>
          repo.updateIfVersion(ctx.userId!, params.id, version, {
            ...existing,
            title: body.title ?? existing.title,
            body: body.body ?? existing.body,
            version: existing.version + 1,
            updatedAt: now,
          }),
        );
        return jsonEntity(200, next, noteResponse);
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
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await repo.getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const now = new Date().toISOString();
        const tombstone = await runVersionedMutation(resolved.fromIfMatch, () =>
          repo.softDelete(ctx.userId!, params.id, version, {
            ...existing,
            version: existing.version + 1,
            updatedAt: now,
            deleted: true,
          }),
        );
        return jsonEntity(200, tombstone, noteResponse);
      },
    }),
  ];
}

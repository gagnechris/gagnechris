/**
 * Notebook Notes HTTP routes (CHR-40).
 */
import { z } from 'zod';
import {
  CalendarDateSchema,
  CreateNoteRequestSchema,
  DailyNoteGetResponseSchema,
  ExpectedVersionRequestSchema,
  ListNotesQuerySchema,
  NoteListResponseSchema,
  NoteSchema,
  NotebookAreaSchema,
  UlidSchema,
  UpdateNoteRequestSchema,
  UpsertDailyNoteRequestSchema,
  type Note,
} from '@gagnechris/shared';
import {
  jsonEntity,
  requireExpectedVersion,
  runVersionedMutation,
} from '../data/versioned-route.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { notesRepository, type NotesRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });
const DailyParams = z.object({
  area: NotebookAreaSchema,
  date: CalendarDateSchema,
});

function parseNote(note: Note): Note {
  return NoteSchema.parse(note);
}

export function createNoteRoutes(repo?: NotesRepository): RouteDef[] {
  const notes = () => repo ?? notesRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/notebook/notes',
      auth: 'admin',
      metric: 'ListNotes',
      query: ListNotesQuerySchema,
      handler: async (ctx, { query }) => {
        const page = await notes().list(ctx.userId!, query);
        return json(
          200,
          NoteListResponseSchema.parse({
            items: page.items.map(parseNote),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }),
        );
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/notebook/notes',
      auth: 'admin',
      metric: 'CreateNote',
      body: CreateNoteRequestSchema,
      handler: async (ctx, { body }) => {
        const note = await notes().createFromRequest(ctx.userId!, body);
        return jsonEntity(201, note, parseNote);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/notes/daily/:area/:date',
      auth: 'admin',
      metric: 'GetDailyNote',
      params: DailyParams,
      handler: async (ctx, { params }) => {
        const result = await notes().getDaily(
          ctx.userId!,
          params.area,
          params.date,
        );
        const body = DailyNoteGetResponseSchema.parse(result);
        if ('exists' in body && body.exists === false) {
          return json(200, body);
        }
        return jsonEntity(200, body as Note, parseNote);
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/notes/daily/:area/:date',
      auth: 'admin',
      metric: 'UpsertDailyNote',
      params: DailyParams,
      body: UpsertDailyNoteRequestSchema,
      handler: async (ctx, { params, body }) => {
        const existing = await notes().getDaily(
          ctx.userId!,
          params.area,
          params.date,
        );
        const isCreate = 'exists' in existing && existing.exists === false;
        if (isCreate) {
          const note = await notes().upsertDaily(
            ctx.userId!,
            params.area,
            params.date,
            body,
            'any',
          );
          return jsonEntity(200, note, parseNote);
        }
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const note = await runVersionedMutation(resolved.fromIfMatch, () =>
          notes().upsertDaily(
            ctx.userId!,
            params.area,
            params.date,
            body,
            resolved.expected,
          ),
        );
        return jsonEntity(200, note, parseNote);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/notes/:id',
      auth: 'admin',
      metric: 'GetNote',
      params: IdParams,
      handler: async (ctx, { params }) => {
        const note = await notes().getOrThrow(ctx.userId!, params.id);
        return jsonEntity(200, note, parseNote);
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/notes/:id',
      auth: 'admin',
      metric: 'UpdateNote',
      params: IdParams,
      body: UpdateNoteRequestSchema,
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const note = await runVersionedMutation(resolved.fromIfMatch, () =>
          notes().updateFromRequest(
            ctx.userId!,
            params.id,
            resolved.expected,
            body,
          ),
        );
        return jsonEntity(200, note, parseNote);
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/notebook/notes/:id',
      auth: 'admin',
      metric: 'DeleteNote',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const tombstone = await runVersionedMutation(resolved.fromIfMatch, () =>
          notes().deleteIfVersion(ctx.userId!, params.id, resolved.expected),
        );
        return jsonEntity(200, tombstone, parseNote);
      },
    }),
  ];
}

/** Prod route table export (eager repo construct registers sync adapter). */
export const noteRoutes: RouteDef[] = createNoteRoutes();

import { z } from 'zod';
import { normalizeTags } from '@gagnechris/data';
import {
  CalendarDateSchema,
  CreateNoteRequestSchema,
  DailyNoteGetResponseSchema,
  ExpectedVersionRequestSchema,
  ListNotesQuerySchema,
  NoteListResponseSchema,
  NoteSchema,
  NotebookAreaSchema,
  OpenDailyNoteRequestSchema,
  UlidSchema,
  UpdateNoteRequestSchema,
  UpsertDailyNoteRequestSchema,
  carriedInMarkdown,
  type Note,
} from '@gagnechris/shared';
import {
  jsonEntity,
  requireExpectedVersion,
  runVersionedMutation,
  versionedMutationRoute,
} from '../data/versioned-route.js';
import { parseIfMatch } from '../data/concurrency.js';
import { ConflictError } from '../data/errors.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { tasksRepository, type TasksRepository } from '../tasks/repository.js';
import {
  isEmptyDaily,
  notesRepository,
  type DailyNoteResult,
  type NotesRepository,
} from './repository.js';

const IdParams = z.object({ id: UlidSchema });
const DailyParams = z.object({
  area: NotebookAreaSchema,
  date: CalendarDateSchema,
});

function parseNote(note: Note): Note {
  return NoteSchema.parse(note);
}

function hasExpectedVersion(
  event: { headers?: Record<string, string | undefined> },
  body: { version?: number },
): boolean {
  return (
    body.version !== undefined || parseIfMatch(event.headers) !== undefined
  );
}

/** A retried create of the same daily note (same id and content) is a no-op. */
function noteMatchesUpsert(
  note: Note,
  body: {
    title?: string;
    bodyMarkdown?: string;
    tags?: string[];
    pinned?: boolean;
  },
): boolean {
  return (
    note.version === 1 &&
    (body.title ?? '') === note.title &&
    (body.bodyMarkdown ?? '') === note.bodyMarkdown &&
    (body.pinned ?? false) === note.pinned &&
    JSON.stringify(normalizeTags(body.tags ?? [])) === JSON.stringify(note.tags)
  );
}

export function createNoteRoutes(
  repo?: NotesRepository,
  taskRepo?: TasksRepository,
): RouteDef[] {
  const notes = () => repo ?? notesRepository();
  const tasks = () => taskRepo ?? tasksRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/notebook/notes',
      auth: 'notebook',
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
      auth: 'notebook',
      metric: 'CreateNote',
      oversizedBody413: true,
      body: CreateNoteRequestSchema,
      handler: async (ctx, { body }) => {
        const note = await notes().createFromRequest(ctx.userId!, body);
        return jsonEntity(201, note, parseNote);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/notes/daily/:area/:date',
      auth: 'notebook',
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
      method: 'POST',
      pattern: '/notebook/notes/daily/:area/:date/open',
      auth: 'notebook',
      metric: 'OpenDailyNote',
      params: DailyParams,
      body: OpenDailyNoteRequestSchema,
      handler: async (ctx, { params, body }) => {
        const { area, date } = params;
        const respond = (result: DailyNoteResult) =>
          isEmptyDaily(result)
            ? json(200, DailyNoteGetResponseSchema.parse(result))
            : jsonEntity(200, result, parseNote);

        const existing = await notes().getDaily(ctx.userId!, area, date);
        if (!isEmptyDaily(existing)) return respond(existing);
        const carried = await tasks().carriedInto(ctx.userId!, area, date);
        if (carried.length === 0) return respond(existing);
        try {
          const note = await notes().createDaily(ctx.userId!, area, date, {
            id: body.id,
            bodyMarkdown: carriedInMarkdown(carried),
          });
          return jsonEntity(200, note, parseNote);
        } catch (error) {
          // Another device opened the day first: its note is the one record.
          if (!(error instanceof ConflictError)) throw error;
          const current = await notes().getDaily(ctx.userId!, area, date);
          if (isEmptyDaily(current)) throw error;
          return respond(current);
        }
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/notes/daily/:area/:date',
      auth: 'notebook',
      metric: 'UpsertDailyNote',
      oversizedBody413: true,
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
          // Straight to the claim: re-reading here and updating whoever won
          // would let two writers both get 200 and one silently overwrite.
          const note = await notes().createDaily(
            ctx.userId!,
            params.area,
            params.date,
            body,
          );
          return jsonEntity(200, note, parseNote);
        }
        // A writer still holding the empty placeholder (no version) lost the
        // race to create this day: hand back the winner so it can merge
        // instead of failing with 400 on every retry.
        const current = existing as Note;
        if (!hasExpectedVersion(ctx.event, body)) {
          if (current.id === body.id && noteMatchesUpsert(current, body)) {
            return jsonEntity(200, current, parseNote);
          }
          throw new ConflictError(
            current.id === body.id
              ? 'Daily note changed since it was created'
              : 'Daily note already exists for this area and date',
            {
              code: current.id === body.id ? 'version_conflict' : 'daily_taken',
              currentVersion: current.version,
              current,
            },
          );
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
      auth: 'notebook',
      metric: 'GetNote',
      params: IdParams,
      handler: async (ctx, { params }) => {
        const note = await notes().getOrThrow(ctx.userId!, params.id);
        return jsonEntity(200, note, parseNote);
      },
    }),
    versionedMutationRoute({
      method: 'PUT',
      pattern: '/notebook/notes/:id',
      metric: 'UpdateNote',
      oversizedBody413: true,
      params: IdParams,
      body: UpdateNoteRequestSchema,
      mutate: (ctx, { params, body, expected }) =>
        notes().updateFromRequest(ctx.userId!, params.id, expected, body),
      respond: parseNote,
    }),
    versionedMutationRoute({
      method: 'DELETE',
      pattern: '/notebook/notes/:id',
      metric: 'DeleteNote',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      mutate: (ctx, { params, expected }) =>
        notes().deleteIfVersion(ctx.userId!, params.id, expected),
      respond: parseNote,
    }),
  ];
}

export const noteRoutes: RouteDef[] = createNoteRoutes();

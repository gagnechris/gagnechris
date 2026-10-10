import * as z from 'zod';
import {
  CalendarDateSchema,
  CreateNoteRequestSchema,
  DailyNoteGetResponseSchema,
  ExpectedVersionRequestSchema,
  ListNotesQuerySchema,
  NoteBatchResponseSchema,
  NoteListResponseSchema,
  NotebookBatchRequestSchema,
  NoteSchema,
  NotebookAreaSchema,
  OpenDailyNoteRequestSchema,
  UlidSchema,
  UpdateNoteRequestSchema,
  UpsertDailyNoteRequestSchema,
  carriedInMarkdown,
  fillDailyTemplate,
  type NotebookArea,
  type Note,
} from '@gagnechris/shared';
import { jsonEntity, versionedMutationRoute } from '../data/versioned-route.js';
import { ConflictError } from '../data/errors.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { tasksRepository, type TasksRepository } from '../tasks/repository.js';
import { DailyTemplatesRepository } from '../templates/repository.js';
import {
  isEmptyDaily,
  notesRepository,
  type DailyNoteResult,
  type EmptyDailyNote,
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

export function createNoteRoutes(
  repo?: NotesRepository,
  taskRepo?: TasksRepository,
  templateRepo?: DailyTemplatesRepository,
): RouteDef[] {
  const notes = () => repo ?? notesRepository();
  const tasks = () => taskRepo ?? tasksRepository();
  // Defaults to the notes table so a test's in-memory table serves both.
  const templates = () =>
    templateRepo ??
    new DailyTemplatesRepository(notes().doc, notes().tableName);
  const filledTemplate = async (
    userId: string,
    area: NotebookArea,
    date: string,
  ) => {
    const template = await templates().get(userId, area);
    return fillDailyTemplate(template.bodyMarkdown, { area, date });
  };
  const emptyDay = async (result: EmptyDailyNote) =>
    json(
      200,
      DailyNoteGetResponseSchema.parse({
        ...result,
        templateMarkdown: await filledTemplate(
          result.userId,
          result.area,
          result.date,
        ),
      }),
    );
  return [
    defineRoute({
      method: 'POST',
      pattern: '/notebook/notes/batch',
      auth: 'notebook',
      metric: 'BatchGetNotes',
      body: NotebookBatchRequestSchema,
      handler: async (ctx, { body }) => {
        const items = await notes().getMany(ctx.userId!, body.ids);
        return json(
          200,
          NoteBatchResponseSchema.parse({ items: items.map(parseNote) }),
        );
      },
    }),
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
        if (isEmptyDaily(result)) return emptyDay(result);
        return jsonEntity(200, result, parseNote);
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
            ? emptyDay(result)
            : jsonEntity(200, result, parseNote);

        const existing = await notes().getDaily(ctx.userId!, area, date);
        if (!isEmptyDaily(existing)) return respond(existing);
        const carried = await tasks().carriedInto(ctx.userId!, area, date);
        if (carried.length === 0) return respond(existing);
        try {
          const template = await filledTemplate(ctx.userId!, area, date);
          const note = await notes().createDaily(ctx.userId!, area, date, {
            id: body.id,
            bodyMarkdown: `${carriedInMarkdown(carried)}${template}`,
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
    versionedMutationRoute({
      method: 'PUT',
      pattern: '/notebook/notes/daily/:area/:date',
      metric: 'UpsertDailyNote',
      oversizedBody413: true,
      params: DailyParams,
      body: UpsertDailyNoteRequestSchema,
      mutate: (ctx, { params, body, expected }) =>
        notes().updateDaily(
          ctx.userId!,
          params.area,
          params.date,
          body,
          expected,
        ),
      withoutVersion: (ctx, { params, body }) =>
        notes().createDailyOrReplay(
          ctx.userId!,
          params.area,
          params.date,
          body,
        ),
      respond: parseNote,
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

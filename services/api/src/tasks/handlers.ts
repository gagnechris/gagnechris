import { z } from 'zod';
import {
  CreateTaskRequestSchema,
  ExpectedVersionRequestSchema,
  ListTasksQuerySchema,
  TaskListResponseSchema,
  TaskSchema,
  UlidSchema,
  UpdateTaskRequestSchema,
  type Task,
} from '@gagnechris/shared';
import { jsonEntity, versionedMutationRoute } from '../data/versioned-route.js';
import { json } from '../http.js';
import { notesRepository, type NotesRepository } from '../notes/repository.js';
import { defineRoute, type RouteDef } from '../router.js';
import { tasksRepository, type TasksRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });

function parseTask(task: Task): Task {
  return TaskSchema.parse(task);
}

export function createTaskRoutes(
  repo?: TasksRepository,
  notesRepo?: NotesRepository,
): RouteDef[] {
  const tasks = () => repo ?? tasksRepository();
  const notes = () => notesRepo ?? notesRepository();

  const checkLinkedNote = async (
    userId: string,
    noteId: string | null | undefined,
  ) => {
    if (noteId == null) return undefined;
    const note = await notes().get(userId, noteId);
    if (note && !note.deleted) return undefined;
    return json(400, {
      error: 'bad_request',
      message: 'noteId must reference an existing note',
      fields: { noteId: 'not_found' },
    });
  };
  return [
    defineRoute({
      method: 'GET',
      pattern: '/notebook/tasks',
      auth: 'admin',
      metric: 'ListTasks',
      query: ListTasksQuerySchema,
      handler: async (ctx, { query }) => {
        const page = await tasks().list(ctx.userId!, query);
        return json(
          200,
          TaskListResponseSchema.parse({
            items: page.items.map(parseTask),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }),
        );
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/notebook/tasks',
      auth: 'admin',
      metric: 'CreateTask',
      oversizedBody413: true,
      body: CreateTaskRequestSchema,
      handler: async (ctx, { body }) => {
        const badNote = await checkLinkedNote(ctx.userId!, body.noteId);
        if (badNote) return badNote;
        const task = await tasks().createFromRequest(ctx.userId!, body);
        return jsonEntity(201, task, parseTask);
      },
    }),
    versionedMutationRoute({
      method: 'POST',
      pattern: '/notebook/tasks/:id/complete',
      metric: 'CompleteTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      mutate: (ctx, { params, expected }) =>
        tasks().complete(ctx.userId!, params.id, expected),
      respond: parseTask,
    }),
    versionedMutationRoute({
      method: 'POST',
      pattern: '/notebook/tasks/:id/reopen',
      metric: 'ReopenTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      mutate: (ctx, { params, expected }) =>
        tasks().reopen(ctx.userId!, params.id, expected),
      respond: parseTask,
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/tasks/:id',
      auth: 'admin',
      metric: 'GetTask',
      params: IdParams,
      handler: async (ctx, { params }) => {
        const task = await tasks().getOrThrow(ctx.userId!, params.id);
        return jsonEntity(200, task, parseTask);
      },
    }),
    versionedMutationRoute({
      method: 'PUT',
      pattern: '/notebook/tasks/:id',
      metric: 'UpdateTask',
      oversizedBody413: true,
      params: IdParams,
      body: UpdateTaskRequestSchema,
      // Only a changed link is checked: the web resends noteId on every
      // save, and a task whose note was later deleted must stay editable.
      // This read only gates validation; the write itself is built from a
      // consistent read in the repository.
      precheck: async (ctx, { params, body }) => {
        if (body.noteId == null) return undefined;
        const existing = await tasks().getOrThrow(ctx.userId!, params.id);
        if (body.noteId === existing.noteId) return undefined;
        return checkLinkedNote(ctx.userId!, body.noteId);
      },
      mutate: (ctx, { params, body, expected }) =>
        tasks().updateFromRequest(ctx.userId!, params.id, expected, body),
      respond: parseTask,
    }),
    versionedMutationRoute({
      method: 'DELETE',
      pattern: '/notebook/tasks/:id',
      metric: 'DeleteTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      mutate: (ctx, { params, expected }) =>
        tasks().deleteIfVersion(ctx.userId!, params.id, expected),
      respond: parseTask,
    }),
  ];
}

export const taskRoutes: RouteDef[] = createTaskRoutes();

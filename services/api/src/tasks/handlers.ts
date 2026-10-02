/**
 * Notebook Tasks HTTP routes (CHR-43).
 */
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
import {
  jsonEntity,
  requireExpectedVersion,
  runVersionedMutation,
  versionForWrite,
} from '../data/versioned-route.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { tasksRepository, type TasksRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });

function parseTask(task: Task): Task {
  return TaskSchema.parse(task);
}

export function createTaskRoutes(repo?: TasksRepository): RouteDef[] {
  const tasks = () => repo ?? tasksRepository();
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
      body: CreateTaskRequestSchema,
      handler: async (ctx, { body }) => {
        const task = await tasks().createFromRequest(ctx.userId!, body);
        return jsonEntity(201, task, parseTask);
      },
    }),
    // Literal segments before :id (complete/reopen).
    defineRoute({
      method: 'POST',
      pattern: '/notebook/tasks/:id/complete',
      auth: 'admin',
      metric: 'CompleteTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await tasks().getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const task = await runVersionedMutation(resolved.fromIfMatch, () =>
          tasks().complete(ctx.userId!, params.id, version, existing),
        );
        return jsonEntity(200, task, parseTask);
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/notebook/tasks/:id/reopen',
      auth: 'admin',
      metric: 'ReopenTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await tasks().getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const task = await runVersionedMutation(resolved.fromIfMatch, () =>
          tasks().reopen(ctx.userId!, params.id, version, existing),
        );
        return jsonEntity(200, task, parseTask);
      },
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
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/tasks/:id',
      auth: 'admin',
      metric: 'UpdateTask',
      params: IdParams,
      body: UpdateTaskRequestSchema,
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await tasks().getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const task = await runVersionedMutation(resolved.fromIfMatch, () =>
          tasks().updateFromRequest(
            ctx.userId!,
            params.id,
            version,
            body,
            existing,
          ),
        );
        return jsonEntity(200, task, parseTask);
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/notebook/tasks/:id',
      auth: 'admin',
      metric: 'DeleteTask',
      params: IdParams,
      body: ExpectedVersionRequestSchema.partial(),
      handler: async (ctx, { params, body }) => {
        const resolved = requireExpectedVersion(ctx.event, body);
        if (!resolved.ok) return resolved.response;
        const existing = await tasks().getOrThrow(ctx.userId!, params.id);
        const version = versionForWrite(resolved.expected, existing.version);
        const now = new Date().toISOString();
        const tombstone = await runVersionedMutation(resolved.fromIfMatch, () =>
          tasks().softDelete(ctx.userId!, params.id, version, {
            ...existing,
            version: existing.version + 1,
            updatedAt: now,
            deleted: true,
          }),
        );
        return jsonEntity(200, tombstone, parseTask);
      },
    }),
  ];
}

export const taskRoutes: RouteDef[] = createTaskRoutes();

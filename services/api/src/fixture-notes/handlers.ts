import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { z } from 'zod';
import {
  CreateFixtureNoteRequestSchema,
  FixtureNoteSchema,
  UpdateFixtureNoteRequestSchema,
  UlidSchema,
} from '@gagnechris/shared';
import { ConflictError, PreconditionFailedError } from '../data/errors.js';
import { json, jsonWithEtag, parseIfMatchVersion } from '../http.js';
import { dispatchRoutes, type RouteDef, type RouteHandler } from '../router.js';
import { isDeletedFixtureNote } from './items.js';
import { FixtureNotesRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });

const DeleteBodySchema = z.object({
  version: z.number().int().nonnegative().optional(),
});

function headerRecord(
  event: APIGatewayProxyEventV2,
): Record<string, string | undefined> {
  return event.headers ?? {};
}

function resolveExpectedVersion(
  event: APIGatewayProxyEventV2,
  body: { version?: number },
): { expected?: number; fromIfMatch: boolean } {
  const fromIfMatch = parseIfMatchVersion(headerRecord(event));
  if (fromIfMatch !== undefined) {
    return { expected: fromIfMatch, fromIfMatch: true };
  }
  if (body.version !== undefined) {
    return { expected: body.version, fromIfMatch: false };
  }
  return { expected: undefined, fromIfMatch: false };
}

function mapVersionConflict(error: unknown, fromIfMatch: boolean): never {
  if (error instanceof ConflictError && fromIfMatch) {
    throw new PreconditionFailedError(error.message, {
      currentVersion: error.currentVersion,
    });
  }
  throw error;
}

function fixtureNoteHandlers(repo?: FixtureNotesRepository): {
  create: RouteHandler;
  get: RouteHandler;
  update: RouteHandler;
  remove: RouteHandler;
} {
  const notes = () => repo ?? new FixtureNotesRepository();
  return {
    create: async (ctx, { body }) => {
      const userId = ctx.userId;
      if (!userId) {
        return json(401, {
          error: 'unauthorized',
          message: 'Missing JWT claims',
        });
      }
      const req = body as z.infer<typeof CreateFixtureNoteRequestSchema>;
      const note = await notes().createIdempotent(userId, req);
      const parsed = FixtureNoteSchema.parse(note);
      return jsonWithEtag(201, parsed, parsed.version);
    },
    get: async (ctx, { params }) => {
      const userId = ctx.userId;
      if (!userId) {
        return json(401, {
          error: 'unauthorized',
          message: 'Missing JWT claims',
        });
      }
      const { id } = params as z.infer<typeof IdParams>;
      const note = await notes().getForUser(userId, id);
      if (isDeletedFixtureNote(note)) {
        return json(404, {
          error: 'not_found',
          message: `Fixture note ${id} not found`,
        });
      }
      const parsed = FixtureNoteSchema.parse(note);
      return jsonWithEtag(200, parsed, parsed.version);
    },
    update: async (ctx, { params, body }) => {
      const userId = ctx.userId;
      if (!userId) {
        return json(401, {
          error: 'unauthorized',
          message: 'Missing JWT claims',
        });
      }
      const { id } = params as z.infer<typeof IdParams>;
      const patch = body as z.infer<typeof UpdateFixtureNoteRequestSchema>;
      const { expected, fromIfMatch } = resolveExpectedVersion(
        ctx.event,
        patch,
      );
      if (expected === undefined) {
        return json(400, {
          error: 'bad_request',
          message: 'Expected version required (If-Match or body.version)',
        });
      }
      try {
        const note = await notes().update(userId, id, expected, patch);
        const parsed = FixtureNoteSchema.parse(note);
        return jsonWithEtag(200, parsed, parsed.version);
      } catch (error) {
        mapVersionConflict(error, fromIfMatch);
      }
    },
    remove: async (ctx, { params, body }) => {
      const userId = ctx.userId;
      if (!userId) {
        return json(401, {
          error: 'unauthorized',
          message: 'Missing JWT claims',
        });
      }
      const { id } = params as z.infer<typeof IdParams>;
      const parsedBody = DeleteBodySchema.parse(body ?? {});
      const { expected, fromIfMatch } = resolveExpectedVersion(
        ctx.event,
        parsedBody,
      );
      if (expected === undefined) {
        return json(400, {
          error: 'bad_request',
          message: 'Expected version required (If-Match or body.version)',
        });
      }
      try {
        const note = await notes().tombstone(userId, id, expected);
        const parsed = FixtureNoteSchema.parse(note);
        return jsonWithEtag(200, parsed, parsed.version);
      } catch (error) {
        mapVersionConflict(error, fromIfMatch);
      }
    },
  };
}

export function createFixtureNoteRoutes(
  repo?: FixtureNotesRepository,
): RouteDef[] {
  const h = fixtureNoteHandlers(repo);
  return [
    {
      method: 'POST',
      pattern: '/notebook/fixture-notes',
      auth: 'admin',
      metric: 'CreateFixtureNote',
      body: CreateFixtureNoteRequestSchema,
      handler: h.create,
    },
    {
      method: 'GET',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'GetFixtureNote',
      params: IdParams,
      handler: h.get,
    },
    {
      method: 'PUT',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'UpdateFixtureNote',
      params: IdParams,
      body: UpdateFixtureNoteRequestSchema,
      handler: h.update,
    },
    {
      method: 'DELETE',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'DeleteFixtureNote',
      params: IdParams,
      body: DeleteBodySchema,
      handler: h.remove,
    },
  ];
}

export const fixtureNoteRoutes = createFixtureNoteRoutes();

export async function handleFixtureNoteRoutes(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  repo?: FixtureNotesRepository,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  return dispatchRoutes(createFixtureNoteRoutes(repo), event, method, path, {
    onMiss: 'undefined',
    enforceAuth: false,
  });
}

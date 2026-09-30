import {
  CreateFixtureNoteRequestSchema,
  FixtureNoteSchema,
  UpdateFixtureNoteRequestSchema,
  UlidSchema,
} from '@gagnechris/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { ConflictError, PreconditionFailedError } from '../data/errors.js';
import { json, jsonWithEtag, parseIfMatchVersion } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
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

export function createFixtureNoteRoutes(
  repo?: FixtureNotesRepository,
): RouteDef[] {
  const notes = () => repo ?? new FixtureNotesRepository();
  return [
    defineRoute({
      method: 'POST',
      pattern: '/notebook/fixture-notes',
      auth: 'admin',
      metric: 'CreateFixtureNote',
      body: CreateFixtureNoteRequestSchema,
      handler: async (ctx, { body }) => {
        const userId = ctx.userId!;
        const note = await notes().createIdempotent(userId, body);
        const parsed = FixtureNoteSchema.parse(note);
        return jsonWithEtag(201, parsed, parsed.version);
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'GetFixtureNote',
      params: IdParams,
      handler: async (ctx, { params }) => {
        const userId = ctx.userId!;
        const note = await notes().getForUser(userId, params.id);
        if (isDeletedFixtureNote(note)) {
          return json(404, {
            error: 'not_found',
            message: `Fixture note ${params.id} not found`,
          });
        }
        const parsed = FixtureNoteSchema.parse(note);
        return jsonWithEtag(200, parsed, parsed.version);
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'UpdateFixtureNote',
      params: IdParams,
      body: UpdateFixtureNoteRequestSchema,
      handler: async (ctx, { params, body }) => {
        const userId = ctx.userId!;
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
        try {
          const note = await notes().update(userId, params.id, expected, body);
          const parsed = FixtureNoteSchema.parse(note);
          return jsonWithEtag(200, parsed, parsed.version);
        } catch (error) {
          mapVersionConflict(error, fromIfMatch);
        }
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/notebook/fixture-notes/:id',
      auth: 'admin',
      metric: 'DeleteFixtureNote',
      params: IdParams,
      body: DeleteBodySchema,
      handler: async (ctx, { params, body }) => {
        const userId = ctx.userId!;
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
        try {
          const note = await notes().tombstone(userId, params.id, expected);
          const parsed = FixtureNoteSchema.parse(note);
          return jsonWithEtag(200, parsed, parsed.version);
        } catch (error) {
          mapVersionConflict(error, fromIfMatch);
        }
      },
    }),
  ];
}

export const fixtureNoteRoutes = createFixtureNoteRoutes();

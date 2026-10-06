/**
 * Versioned write routes. Notebook writes take If-Match or `body.version` and
 * answer with an ETag; site-admin writes take `body.version` only.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { z, ZodType } from 'zod';
import { ExpectedVersionRequestSchema } from '@gagnechris/shared';
import { json, jsonWithEtag } from '../http.js';
import {
  defineRoute,
  type InferOrDefault,
  type RouteCtx,
  type RouteDef,
} from '../router.js';
import { mapVersionConflict, resolveExpectedVersion } from './concurrency.js';
import { BadRequestError } from './errors.js';

type ExpectedVersion = {
  ok: true;
  expected: number | 'any' | undefined;
  fromIfMatch: boolean;
};

type ExpectedVersionErr = {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
};

const badRequest = (message: string): ExpectedVersionErr => ({
  ok: false,
  response: json(400, { error: 'bad_request', message }),
});

export function readExpectedVersion(
  event: APIGatewayProxyEventV2,
  body: { version?: number },
): ExpectedVersion | ExpectedVersionErr {
  try {
    const { expected, fromIfMatch } = resolveExpectedVersion(event, body);
    return { ok: true, expected, fromIfMatch };
  } catch (error) {
    if (error instanceof BadRequestError) return badRequest(error.message);
    throw error;
  }
}

async function runVersionedMutation<T>(
  fromIfMatch: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapVersionConflict(error, fromIfMatch);
  }
}

export function jsonEntity<T extends { version: number }>(
  statusCode: number,
  entity: T,
  mapBody: (entity: T) => unknown = (e) => e,
): APIGatewayProxyStructuredResultV2 {
  return jsonWithEtag(statusCode, mapBody(entity), entity.version);
}

export type VersionedMutationInput<TParams, TBody> = {
  params: TParams;
  body: TBody;
};

/**
 * Expected version (If-Match or body) → `precheck` → `mutate` → 200 + ETag.
 * `precheck` runs after the version check so a missing version is always 400,
 * unless `withoutVersion` is given: then a request with no version runs it
 * instead of `mutate`.
 */
export function versionedMutationRoute<
  TParams extends ZodType,
  TBody extends ZodType<{ version?: number }>,
  T extends { version: number },
>(def: {
  method: RouteDef['method'];
  pattern: string;
  metric: string;
  params: TParams;
  body: TBody;
  oversizedBody413?: boolean;
  precheck?: (
    ctx: RouteCtx,
    input: VersionedMutationInput<z.infer<TParams>, z.infer<TBody>>,
  ) => Promise<APIGatewayProxyStructuredResultV2 | undefined>;
  mutate: (
    ctx: RouteCtx,
    input: VersionedMutationInput<z.infer<TParams>, z.infer<TBody>> & {
      expected: number | 'any';
    },
  ) => Promise<T>;
  withoutVersion?: (
    ctx: RouteCtx,
    input: VersionedMutationInput<z.infer<TParams>, z.infer<TBody>>,
  ) => Promise<T>;
  respond: (entity: T) => unknown;
}): RouteDef {
  return defineRoute({
    method: def.method,
    pattern: def.pattern,
    auth: 'notebook',
    metric: def.metric,
    params: def.params,
    body: def.body,
    ...(def.oversizedBody413 ? { oversizedBody413: true } : {}),
    handler: async (ctx, { params, body }) => {
      const input = {
        params: params as z.infer<TParams>,
        body: body as z.infer<TBody>,
      };
      const resolved = readExpectedVersion(ctx.event, input.body);
      if (!resolved.ok) return resolved.response;
      const { expected, fromIfMatch } = resolved;
      if (expected === undefined && !def.withoutVersion) {
        return badRequest(
          'Expected version required (If-Match or body.version)',
        ).response;
      }
      const early = await def.precheck?.(ctx, input);
      if (early) return early;
      const entity =
        expected === undefined
          ? await def.withoutVersion!(ctx, input)
          : await runVersionedMutation(fromIfMatch, () =>
              def.mutate(ctx, { ...input, expected }),
            );
      return jsonEntity(200, entity, def.respond);
    },
  });
}

/**
 * Site-admin write: `body.version` (default body {@link ExpectedVersionRequestSchema})
 * → `mutate` → 200 with the entity parsed through `entity`. Version conflicts
 * and NotFoundError map to 409 / 404 in the router.
 */
export function siteAdminVersionedRoute<
  TParams extends ZodType | undefined = undefined,
  TBody extends ZodType<{ version: number }> =
    typeof ExpectedVersionRequestSchema,
>(def: {
  method: 'PUT' | 'POST' | 'DELETE';
  pattern: string;
  metric: string;
  params?: TParams;
  body?: TBody;
  entity: ZodType;
  mutate: (input: {
    params: InferOrDefault<TParams, Record<string, string>>;
    body: z.infer<TBody>;
  }) => Promise<unknown>;
}): RouteDef {
  return {
    method: def.method,
    pattern: def.pattern,
    auth: 'site-admin',
    metric: def.metric,
    ...(def.params ? { params: def.params } : {}),
    body: def.body ?? ExpectedVersionRequestSchema,
    handler: async (_ctx, { params, body }) =>
      json(
        200,
        def.entity.parse(
          await def.mutate({
            params: params as InferOrDefault<TParams, Record<string, string>>,
            body: body as z.infer<TBody>,
          }),
        ),
      ),
  };
}

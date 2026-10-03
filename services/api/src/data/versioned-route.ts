/** If-Match / ETag helpers for versioned Notebook mutations. */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { z, ZodType } from 'zod';
import { json, jsonWithEtag } from '../http.js';
import { defineRoute, type RouteCtx, type RouteDef } from '../router.js';
import { mapVersionConflict, resolveExpectedVersion } from './concurrency.js';

export type ExpectedVersionOk = {
  ok: true;
  expected: number | 'any';
  fromIfMatch: boolean;
};

export type ExpectedVersionErr = {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
};

export function requireExpectedVersion(
  event: APIGatewayProxyEventV2,
  body: { version?: number },
): ExpectedVersionOk | ExpectedVersionErr {
  try {
    const { expected, fromIfMatch } = resolveExpectedVersion(event, body);
    if (expected === undefined) {
      return {
        ok: false,
        response: json(400, {
          error: 'bad_request',
          message: 'Expected version required (If-Match or body.version)',
        }),
      };
    }
    return { ok: true, expected, fromIfMatch };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: json(400, {
          error: 'bad_request',
          message: error.message,
        }),
      };
    }
    throw error;
  }
}

export async function runVersionedMutation<T>(
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
 * `precheck` runs after the version check so a missing version is always 400.
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
  respond: (entity: T) => unknown;
}): RouteDef {
  return defineRoute({
    method: def.method,
    pattern: def.pattern,
    auth: 'admin',
    metric: def.metric,
    params: def.params,
    body: def.body,
    ...(def.oversizedBody413 ? { oversizedBody413: true } : {}),
    handler: async (ctx, { params, body }) => {
      const input = {
        params: params as z.infer<TParams>,
        body: body as z.infer<TBody>,
      };
      const resolved = requireExpectedVersion(ctx.event, input.body);
      if (!resolved.ok) return resolved.response;
      const early = await def.precheck?.(ctx, input);
      if (early) return early;
      const entity = await runVersionedMutation(resolved.fromIfMatch, () =>
        def.mutate(ctx, { ...input, expected: resolved.expected }),
      );
      return jsonEntity(200, entity, def.respond);
    },
  });
}

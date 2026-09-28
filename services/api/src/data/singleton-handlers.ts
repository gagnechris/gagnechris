import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ZodType } from 'zod';
import { ExpectedVersionRequestSchema } from '@gagnechris/shared';
import { json } from '../http.js';
import {
  dispatchRoutes,
  type RouteDef,
  type RouteHandler,
} from '../router.js';

export type SingletonRepo<T, TUpdate> = {
  getOrCreate: () => Promise<T>;
  update: (input: TUpdate) => Promise<T>;
  publish: (expectedVersion?: number) => Promise<T>;
  unpublish: (expectedVersion?: number) => Promise<T>;
  discard: (expectedVersion?: number) => Promise<T>;
};

export type SingletonRouteConfig<T, TUpdate> = {
  /** Path after stripping `/api`, e.g. `/admin/home`. */
  basePath: string;
  entitySchema: ZodType<T>;
  updateSchema: ZodType<TUpdate>;
  createRepo: () => SingletonRepo<T, TUpdate>;
};

function singletonHandlers<T, TUpdate>(
  config: SingletonRouteConfig<T, TUpdate>,
  repo?: SingletonRepo<T, TUpdate>,
): {
  get: RouteHandler;
  put: RouteHandler;
  publish: RouteHandler;
  unpublish: RouteHandler;
  discard: RouteHandler;
} {
  const store = () => repo ?? config.createRepo();
  return {
    get: async () =>
      json(200, config.entitySchema.parse(await store().getOrCreate())),
    put: async (_ctx, { body }) =>
      json(
        200,
        config.entitySchema.parse(
          await store().update(body as TUpdate),
        ),
      ),
    publish: async (_ctx, { body }) => {
      const { version } = body as { version: number };
      return json(
        200,
        config.entitySchema.parse(await store().publish(version)),
      );
    },
    unpublish: async (_ctx, { body }) => {
      const { version } = body as { version: number };
      return json(
        200,
        config.entitySchema.parse(await store().unpublish(version)),
      );
    },
    discard: async (_ctx, { body }) => {
      const { version } = body as { version: number };
      return json(
        200,
        config.entitySchema.parse(await store().discard(version)),
      );
    },
  };
}

/** Route table entries for a singleton entity (home / resume). */
export function createSingletonRoutes<T, TUpdate>(
  config: SingletonRouteConfig<T, TUpdate>,
  repo?: SingletonRepo<T, TUpdate>,
): RouteDef[] {
  const h = singletonHandlers(config, repo);
  const base = config.basePath;
  return [
    {
      method: 'GET',
      pattern: base,
      auth: 'admin',
      metric: `Get_${base.replace(/\//g, '_')}`,
      handler: h.get,
    },
    {
      method: 'PUT',
      pattern: base,
      auth: 'admin',
      metric: `Put_${base.replace(/\//g, '_')}`,
      body: config.updateSchema,
      handler: h.put,
    },
    {
      method: 'POST',
      pattern: `${base}/publish`,
      auth: 'admin',
      metric: `Publish_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: h.publish,
    },
    {
      method: 'POST',
      pattern: `${base}/unpublish`,
      auth: 'admin',
      metric: `Unpublish_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: h.unpublish,
    },
    {
      method: 'POST',
      pattern: `${base}/discard`,
      auth: 'admin',
      metric: `Discard_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: h.discard,
    },
  ];
}

/**
 * Shared GET/PUT + publish/unpublish/discard handlers for Home and Resume.
 * Dispatches via the route table (module tests inject `repo`).
 */
export function createSingletonRouteHandler<T, TUpdate>(
  config: SingletonRouteConfig<T, TUpdate>,
) {
  return async function handleSingletonRoute(
    event: APIGatewayProxyEventV2,
    method: string,
    path: string,
    repo?: SingletonRepo<T, TUpdate>,
  ): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
    return dispatchRoutes(
      createSingletonRoutes(config, repo),
      event,
      method,
      path,
      { onMiss: 'undefined', enforceAuth: false },
    );
  };
}

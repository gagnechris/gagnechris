import type { ZodType } from 'zod';
import { ExpectedVersionRequestSchema } from '@gagnechris/shared';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';

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

/** Route table entries for a singleton entity (home / resume). */
export function createSingletonRoutes<T, TUpdate>(
  config: SingletonRouteConfig<T, TUpdate>,
  repo?: SingletonRepo<T, TUpdate>,
): RouteDef[] {
  const store = () => repo ?? config.createRepo();
  const base = config.basePath;
  return [
    defineRoute({
      method: 'GET',
      pattern: base,
      auth: 'admin',
      metric: `Get_${base.replace(/\//g, '_')}`,
      handler: async () =>
        json(200, config.entitySchema.parse(await store().getOrCreate())),
    }),
    defineRoute({
      method: 'PUT',
      pattern: base,
      auth: 'admin',
      metric: `Put_${base.replace(/\//g, '_')}`,
      body: config.updateSchema,
      handler: async (_ctx, { body }) =>
        json(200, config.entitySchema.parse(await store().update(body))),
    }),
    defineRoute({
      method: 'POST',
      pattern: `${base}/publish`,
      auth: 'admin',
      metric: `Publish_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { body }) =>
        json(
          200,
          config.entitySchema.parse(await store().publish(body.version)),
        ),
    }),
    defineRoute({
      method: 'POST',
      pattern: `${base}/unpublish`,
      auth: 'admin',
      metric: `Unpublish_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { body }) =>
        json(
          200,
          config.entitySchema.parse(await store().unpublish(body.version)),
        ),
    }),
    defineRoute({
      method: 'POST',
      pattern: `${base}/discard`,
      auth: 'admin',
      metric: `Discard_${base.replace(/\//g, '_')}`,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { body }) =>
        json(
          200,
          config.entitySchema.parse(await store().discard(body.version)),
        ),
    }),
  ];
}

import type { ZodType } from 'zod';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { siteAdminVersionedRoute } from './versioned-route.js';

export type SingletonRepo<T, TUpdate> = {
  getOrCreate: () => Promise<T>;
  update: (input: TUpdate) => Promise<T>;
  publish: (expectedVersion: number) => Promise<T>;
  unpublish: (expectedVersion: number) => Promise<T>;
  discard: (expectedVersion: number) => Promise<T>;
};

export type SingletonRouteConfig<T, TUpdate extends { version: number }> = {
  basePath: string;
  /** Metric suffix, e.g. `Home` for `GetHome` / `PublishHome`. */
  metricName: string;
  entitySchema: ZodType<T>;
  updateSchema: ZodType<TUpdate>;
  createRepo: () => SingletonRepo<T, TUpdate>;
};

export function createSingletonRoutes<T, TUpdate extends { version: number }>(
  config: SingletonRouteConfig<T, TUpdate>,
  repo?: SingletonRepo<T, TUpdate>,
): RouteDef[] {
  const store = () => repo ?? config.createRepo();
  const { basePath: base, metricName: name, entitySchema: entity } = config;
  return [
    defineRoute({
      method: 'GET',
      pattern: base,
      auth: 'site-admin',
      metric: `Get${name}`,
      handler: async () => json(200, entity.parse(await store().getOrCreate())),
    }),
    siteAdminVersionedRoute({
      method: 'PUT',
      pattern: base,
      metric: `Update${name}`,
      body: config.updateSchema,
      entity,
      mutate: ({ body }) => store().update(body),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: `${base}/publish`,
      metric: `Publish${name}`,
      entity,
      mutate: ({ body }) => store().publish(body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: `${base}/unpublish`,
      metric: `Unpublish${name}`,
      entity,
      mutate: ({ body }) => store().unpublish(body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: `${base}/discard`,
      metric: `Discard${name}`,
      entity,
      mutate: ({ body }) => store().discard(body.version),
    }),
  ];
}

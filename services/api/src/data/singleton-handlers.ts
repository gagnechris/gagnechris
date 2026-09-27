import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ZodType } from 'zod';
import { json, mapRouteError, parseBody } from '../http.js';

export type SingletonRepo<T, TUpdate> = {
  getOrCreate: () => Promise<T>;
  update: (input: TUpdate) => Promise<T>;
  publish: () => Promise<T>;
  unpublish: () => Promise<T>;
  discard: () => Promise<T>;
};

export type SingletonRouteConfig<T, TUpdate> = {
  /** Path after stripping `/api`, e.g. `/admin/home`. */
  basePath: string;
  entitySchema: ZodType<T>;
  updateSchema: ZodType<TUpdate>;
  createRepo: () => SingletonRepo<T, TUpdate>;
};

/**
 * Shared GET/PUT + publish/unpublish/discard handlers for Home and Resume.
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
    const adminPath = path.replace(/^\/api/, '');
    if (!adminPath.startsWith(config.basePath)) {
      return undefined;
    }

    const store = repo ?? config.createRepo();

    try {
      if (adminPath === config.basePath) {
        if (method === 'GET') {
          return json(200, config.entitySchema.parse(await store.getOrCreate()));
        }
        if (method === 'PUT') {
          const body = config.updateSchema.parse(parseBody(event));
          return json(200, config.entitySchema.parse(await store.update(body)));
        }
      }

      if (method === 'POST' && adminPath === `${config.basePath}/publish`) {
        return json(200, config.entitySchema.parse(await store.publish()));
      }

      if (method === 'POST' && adminPath === `${config.basePath}/unpublish`) {
        return json(200, config.entitySchema.parse(await store.unpublish()));
      }

      if (method === 'POST' && adminPath === `${config.basePath}/discard`) {
        return json(200, config.entitySchema.parse(await store.discard()));
      }

      return undefined;
    } catch (error) {
      const mapped = mapRouteError(error);
      if (mapped) return mapped;
      throw error;
    }
  };
}

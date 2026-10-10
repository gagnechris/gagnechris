import * as z from 'zod';
import {
  DailyTemplateSchema,
  ExpectedVersionRequestSchema,
  NotebookAreaSchema,
  UpdateDailyTemplateRequestSchema,
  type DailyTemplate,
} from '@gagnechris/shared';
import { jsonEntity, versionedMutationRoute } from '../data/versioned-route.js';
import { defineRoute, type RouteDef } from '../router.js';
import {
  dailyTemplatesRepository,
  type DailyTemplatesRepository,
} from './repository.js';

const AreaParams = z.object({ area: NotebookAreaSchema });

const PATH = '/notebook/templates/daily/:area';

const parseTemplate = (template: DailyTemplate) =>
  DailyTemplateSchema.parse(template);

export function createTemplateRoutes(
  repo?: DailyTemplatesRepository,
): RouteDef[] {
  const templates = () => repo ?? dailyTemplatesRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: PATH,
      auth: 'notebook',
      metric: 'GetDailyTemplate',
      params: AreaParams,
      handler: async (ctx, { params }) =>
        jsonEntity(
          200,
          await templates().get(ctx.userId!, params.area),
          parseTemplate,
        ),
    }),
    versionedMutationRoute({
      method: 'PUT',
      pattern: PATH,
      metric: 'UpdateDailyTemplate',
      oversizedBody413: true,
      params: AreaParams,
      body: UpdateDailyTemplateRequestSchema,
      mutate: (ctx, { params, body, expected }) =>
        templates().update(
          ctx.userId!,
          params.area,
          body.bodyMarkdown,
          expected,
        ),
      respond: parseTemplate,
    }),
    versionedMutationRoute({
      method: 'DELETE',
      pattern: PATH,
      metric: 'ResetDailyTemplate',
      params: AreaParams,
      body: ExpectedVersionRequestSchema.partial(),
      mutate: (ctx, { params, expected }) =>
        templates().reset(ctx.userId!, params.area, expected),
      respond: parseTemplate,
    }),
  ];
}

export const templateRoutes: RouteDef[] = createTemplateRoutes();

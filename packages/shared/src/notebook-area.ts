import * as z from 'zod';
import {
  NOTEBOOK_AREA_ID_MAX_LENGTH,
  NotebookAreaSchema,
  VersionSchema,
  type NotebookArea,
} from './schemas.js';

export const NOTEBOOK_AREAS_MAX = 4;
export const NOTEBOOK_AREA_NAME_MAX_LENGTH = 30;

export const NotebookAreaEntrySchema = z.object({
  id: NotebookAreaSchema.describe(
    'Fixed once the area is created; notes, tasks and keys store it',
  ),
  name: z.string().trim().min(1).max(NOTEBOOK_AREA_NAME_MAX_LENGTH),
});

export type NotebookAreaEntry = z.infer<typeof NotebookAreaEntrySchema>;

export const DEFAULT_NOTEBOOK_AREAS: readonly NotebookAreaEntry[] = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
];

const AreaListSchema = z
  .array(NotebookAreaEntrySchema)
  .min(1)
  .max(NOTEBOOK_AREAS_MAX)
  .describe(`1 to ${NOTEBOOK_AREAS_MAX} areas, in the order the switch shows`);

export const NotebookAreasSchema = z.object({
  areas: AreaListSchema,
  version: VersionSchema.describe('0 until the list is first saved'),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
});

export type NotebookAreas = z.infer<typeof NotebookAreasSchema>;

export const NOTEBOOK_AREA_DUPLICATE_ID_MESSAGE = 'Two areas have the same id';
export const NOTEBOOK_AREA_DUPLICATE_NAME_MESSAGE =
  'Two areas have the same name';

export const UpdateNotebookAreasRequestSchema = z
  .object({
    version: VersionSchema.optional(),
    areas: AreaListSchema,
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    value.areas.forEach((area, i) => {
      if (ids.has(area.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['areas', i, 'id'],
          message: NOTEBOOK_AREA_DUPLICATE_ID_MESSAGE,
        });
      }
      const name = area.name.toLowerCase();
      if (names.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['areas', i, 'name'],
          message: NOTEBOOK_AREA_DUPLICATE_NAME_MESSAGE,
        });
      }
      ids.add(area.id);
      names.add(name);
    });
  });

export type UpdateNotebookAreasRequest = z.infer<
  typeof UpdateNotebookAreasRequestSchema
>;

export function defaultNotebookAreas(): NotebookAreas {
  return { areas: [...DEFAULT_NOTEBOOK_AREAS], version: 0, updatedAt: null };
}

/** The web's localStorage key and the iOS app's AsyncStorage key. */
export const NOTEBOOK_AREA_STORAGE_KEY = 'gagnechris.notebook.areaFilter';

/** `stored` when it is still one of `areas`, else the first area. */
export function resolveNotebookArea(
  stored: string | null | undefined,
  areas: readonly NotebookAreaEntry[],
): NotebookArea {
  const match = areas.find((a) => a.id === stored);
  return (match ?? areas[0] ?? DEFAULT_NOTEBOOK_AREAS[0]!).id;
}

/** The area's name; an id no longer in the list shows as itself. */
export function notebookAreaName(
  areas: readonly NotebookAreaEntry[],
  id: NotebookArea,
): string {
  return areas.find((a) => a.id === id)?.name ?? id;
}

/** Page kickers: which notebook the page shows. */
export function notebookAreaHeading(name: string): string {
  return `${name} notebook`;
}

/** A new area's id from its name, unlike any id in `taken`. */
export function notebookAreaIdFromName(
  name: string,
  taken: readonly string[],
): NotebookArea {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, NOTEBOOK_AREA_ID_MAX_LENGTH)
      .replace(/^-+|-+$/g, '') || 'area';
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const id =
      base
        .slice(0, NOTEBOOK_AREA_ID_MAX_LENGTH - suffix.length)
        .replace(/-+$/, '') + suffix;
    if (!taken.includes(id)) return id;
  }
}

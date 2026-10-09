import type { ApiClient } from '@gagnechris/api-client';
import {
  ApiError,
  queryKeys,
  setCachedNote,
  setCachedTask,
  unwrap,
  type Note,
  type Task,
} from '@gagnechris/app-core';
import { decodeSyncChangesResponse, type SyncChange } from '@gagnechris/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Kept in the persisted query cache, not beside it, so the watermark is
 * dropped whenever the cache is (sign-out, schema bump, another user).
 */
export const syncWatermarkKey = [...queryKeys.notes.all, 'sync'] as const;

export class UpgradeRequiredError extends Error {
  constructor(readonly minClientVersion: string) {
    super(`Client upgrade required (minimum ${minClientVersion})`);
    this.name = 'UpgradeRequiredError';
  }
}

type Entity = Note | Task;

const kindOf = (type: SyncChange['type']) =>
  type === 'note' ? queryKeys.notes : queryKeys.tasks;

const hasId = (value: unknown, id: string): value is Entity =>
  typeof value === 'object' &&
  value !== null &&
  (value as { id?: unknown }).id === id;

type Paged = { pages: { items: unknown[] }[] };

const isPaged = (data: unknown): data is Paged =>
  typeof data === 'object' &&
  data !== null &&
  Array.isArray((data as { pages?: unknown }).pages);

/** The cached copy of an entity from its detail, daily or list entries. */
export const findCached = (
  queryClient: QueryClient,
  type: SyncChange['type'],
  id: string,
): Entity | undefined => {
  const keys = kindOf(type);
  const detail = queryClient.getQueryData<Entity>(keys.detail(id));
  if (detail) return detail;
  for (const [, data] of queryClient.getQueriesData({ queryKey: keys.all })) {
    if (hasId(data, id)) return data;
    if (!isPaged(data)) continue;
    for (const page of data.pages) {
      const found = page.items.find((item) => hasId(item, id));
      if (found) return found as Entity;
    }
  }
  return undefined;
};

// Same QueryClient at runtime; app-core types it from the root copy of
// @tanstack/query-core, which tsc sees as a different class.
type CoreQueryClient = Parameters<typeof setCachedNote>[0];

export const writeEntity = (
  queryClient: QueryClient,
  entity: Entity,
  type: SyncChange['type'],
) => {
  const core = queryClient as unknown as CoreQueryClient;
  if (type === 'note') setCachedNote(core, entity as Note);
  else setCachedTask(core, entity as Task);
};

/** Swaps every cached copy of the entity for `entity`, whatever its version. */
export const replaceEntity = (
  queryClient: QueryClient,
  entity: Entity,
  type: SyncChange['type'],
) => {
  const keys = kindOf(type);
  for (const [key, data] of queryClient.getQueriesData({
    queryKey: keys.all,
  })) {
    if (hasId(data, entity.id)) {
      queryClient.setQueryData(key, entity);
    } else if (isPaged(data)) {
      queryClient.setQueryData<Paged>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            hasId(item, entity.id) ? entity : item,
          ),
        })),
      });
    }
  }
  const note = entity as Note;
  if (type === 'note' && note.type === 'daily' && note.date) {
    queryClient.setQueryData(queryKeys.notes.daily(note.area, note.date), note);
  }
  writeEntity(queryClient, entity, type);
};

/** Removes the entity's detail and its rows in cached lists. */
export const forgetEntity = (
  queryClient: QueryClient,
  type: SyncChange['type'],
  id: string,
) => {
  const keys = kindOf(type);
  for (const [key, data] of queryClient.getQueriesData({
    queryKey: keys.all,
  })) {
    if (hasId(data, id)) {
      queryClient.removeQueries({ queryKey: key, exact: true });
    } else if (isPaged(data)) {
      queryClient.setQueryData<Paged>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => !hasId(item, id)),
        })),
      });
    }
  }
};

/** Cached tasks whose home note is `noteId`. */
export const cachedTaskIdsInNote = (
  queryClient: QueryClient,
  noteId: string,
): string[] => {
  const ids = new Set<string>();
  for (const [, data] of queryClient.getQueriesData({
    queryKey: queryKeys.tasks.all,
  })) {
    const items = isPaged(data)
      ? data.pages.flatMap((page) => page.items)
      : [data];
    for (const item of items) {
      const task = item as Task | undefined;
      if (task && typeof task === 'object' && task.noteId === noteId) {
        ids.add(task.id);
      }
    }
  }
  return [...ids];
};

/** Keys a write would create for an entity the phone never opened. */
const ownKeys = (type: SyncChange['type'], entity: Entity): QueryKey[] => {
  const keys: QueryKey[] = [kindOf(type).detail(entity.id)];
  const note = entity as Note;
  if (type === 'note' && note.type === 'daily' && note.date) {
    keys.push(queryKeys.notes.daily(note.area, note.date));
  }
  return keys;
};

/**
 * Updates what the phone already caches and adds the entity to matching
 * lists; it never caches details the user hasn't opened, so the persisted
 * cache doesn't grow into a copy of the whole notebook.
 */
export const applySyncChange = (
  queryClient: QueryClient,
  change: SyncChange,
): void => {
  const cached = findCached(queryClient, change.type, change.id);
  // The feed re-sends an overlap window, so the same (id, version) repeats.
  if (cached && cached.version >= change.version) return;
  const entity: Entity | undefined = change.deleted
    ? cached && { ...cached, deleted: true, version: change.version }
    : change.entity;
  if (!entity) return;
  const fresh = ownKeys(change.type, entity).filter(
    (key) => queryClient.getQueryData(key) === undefined,
  );
  writeEntity(queryClient, entity, change.type);
  for (const key of fresh) {
    queryClient.removeQueries({ queryKey: key, exact: true });
  }
};

/** After a full feed: anything cached that the feed didn't list is gone. */
const dropMissing = (
  queryClient: QueryClient,
  seen: Record<SyncChange['type'], Set<string>>,
  keep: (id: string) => boolean,
) => {
  for (const type of ['note', 'task'] as const) {
    const keys = kindOf(type);
    const ids = seen[type];
    for (const [key, data] of queryClient.getQueriesData({
      queryKey: keys.all,
    })) {
      if (isPaged(data)) {
        queryClient.setQueryData<Paged>(key, {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter(
              (item) =>
                !(item as Entity).id ||
                ids.has((item as Entity).id) ||
                keep((item as Entity).id),
            ),
          })),
        });
      } else if (
        typeof data === 'object' &&
        data !== null &&
        typeof (data as Entity).id === 'string' &&
        (data as Entity).version > 0 &&
        !ids.has((data as Entity).id) &&
        !keep((data as Entity).id)
      ) {
        queryClient.removeQueries({ queryKey: key, exact: true });
      }
    }
  }
};

const fetchPage = async (
  client: ApiClient,
  since: string | undefined,
  cursor: string | undefined,
) => {
  const result = await client.GET('/api/notebook/sync/changes', {
    params: { query: { since, cursor } },
  });
  if (result.response.status === 426) {
    const body = result.error as { minClientVersion?: unknown } | undefined;
    throw new UpgradeRequiredError(
      typeof body?.minClientVersion === 'string' ? body.minClientVersion : '',
    );
  }
  return decodeSyncChangesResponse(unwrap(result, 'Could not sync'));
};

const isResyncRequired = (error: unknown) =>
  error instanceof ApiError && error.status === 410;

/**
 * Pages the change feed from the stored watermark and applies it to the
 * query cache. With no watermark, or after a 410, it reads the full feed and
 * drops cached entities the server no longer has.
 */
export const pullSyncChanges = async (
  client: ApiClient,
  queryClient: QueryClient,
  /** Entities with local edits not yet sent: their local copy stays. */
  hasLocalEdits: (id: string) => boolean = () => false,
): Promise<void> => {
  const stored = queryClient.getQueryData<string>(syncWatermarkKey);
  try {
    await pullFrom(client, queryClient, stored, hasLocalEdits);
  } catch (error) {
    if (stored === undefined || !isResyncRequired(error)) throw error;
    await pullFrom(client, queryClient, undefined, hasLocalEdits);
  }
};

const pullFrom = async (
  client: ApiClient,
  queryClient: QueryClient,
  since: string | undefined,
  hasLocalEdits: (id: string) => boolean,
) => {
  const seen = { note: new Set<string>(), task: new Set<string>() };
  let cursor: string | undefined;
  let nextSince: string;
  do {
    const page = await fetchPage(client, since, cursor);
    for (const change of page.changes) {
      seen[change.type].add(change.id);
      if (!hasLocalEdits(change.id)) applySyncChange(queryClient, change);
    }
    cursor = page.nextCursor;
    nextSince = page.nextSince;
  } while (cursor);
  if (since === undefined) dropMissing(queryClient, seen, hasLocalEdits);
  queryClient.setQueryData(syncWatermarkKey, nextSince);
};

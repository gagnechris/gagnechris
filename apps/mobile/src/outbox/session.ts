import type { ApiClient, ApiMiddleware } from '@gagnechris/api-client';
import { queryKeys, type Note, type Task } from '@gagnechris/app-core';
import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import {
  cachedTaskIdsInNote,
  findCached,
  forgetEntity,
  replaceEntity,
  writeEntity,
} from '../sync/syncFeed';
import { upgradeRequired } from '../sync/upgradeRequired';
import { createUlid } from '../ulid';
import {
  conflictingFields,
  conflictOf,
  refusalMessage,
  serverCopy,
  type ConflictKind,
  type Entity,
  type EntityType,
  type Op,
} from './ops';
import { Outbox } from './outbox';
import type { OutboxDb } from './store';

/** Marks a request the outbox itself sends, so the middleware lets it through. */
export const OUTBOX_SEND_HEADER = 'x-gagnechris-outbox-send';

let active: Promise<Outbox> | null = null;
let current: Outbox | null = null;
let context: { client: ApiClient; queryClient: QueryClient } | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

/** An entity whose edits the server refused, waiting for the user. */
export type Conflict = {
  entity: EntityType;
  entityId: string;
  kind: ConflictKind;
  /** The server's copy, when the refusal carried one. */
  server: Entity | undefined;
  /** For `changed`: the fields both sides edited. */
  fields: string[];
  message: string | undefined;
};

let conflictList: readonly Conflict[] = [];

const toConflict = (op: Op): Conflict => {
  const kind = conflictOf(op.status ?? 0, op.error) ?? 'refused';
  const server = serverCopy(op.error);
  return {
    entity: op.entity,
    entityId: op.entityId,
    kind,
    server,
    fields: kind === 'changed' && server ? conflictingFields(op, server) : [],
    message: refusalMessage(op.error),
  };
};

const notify = () => {
  conflictList = current ? current.conflicts().map(toConflict) : [];
  for (const listener of [...listeners]) listener();
};

type Sendable = Record<
  Op['method'],
  (
    path: string,
    init: { body: unknown; headers: Record<string, string> },
  ) => Promise<{ response: Response; data?: unknown; error?: unknown }>
>;

// openapi-fetch has already read the body, so the outbox gets it rebuilt.
const sendThrough = (client: ApiClient) => async (op: Op) => {
  const { response, data, error } = await (client as unknown as Sendable)[
    op.method
  ](op.path, { body: op.body, headers: { [OUTBOX_SEND_HEADER]: '1' } });
  const body = data ?? error;
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: response.status,
    headers: { 'content-type': 'application/json' },
  });
};

export type OutboxSessionOptions = {
  db: () => Promise<OutboxDb>;
  client: ApiClient;
  queryClient: QueryClient;
};

/** Opens the signed-in user's outbox and starts sending what it holds. */
export const startOutbox = ({
  db,
  client,
  queryClient,
}: OutboxSessionOptions): Promise<Outbox> => {
  context = { client, queryClient };
  const opening = db().then((database) =>
    Outbox.open({
      db: database,
      send: sendThrough(client),
      lookup: (entity, id) => findCached(queryClient, entity, id),
      onSaved: (entity, saved) => writeEntity(queryClient, saved, entity),
      onReplaced: (entity, copy) => replaceEntity(queryClient, copy, entity),
      onDropped: (entity, id) => forgetEntity(queryClient, entity, id),
      tasksInNote: (noteId) => cachedTaskIdsInNote(queryClient, noteId),
      // A 426 pauses sending too; the queue waits for the updated app.
      isOnline: () => onlineManager.isOnline() && !upgradeRequired(),
    }),
  );
  active = opening;
  void opening.then((outbox) => {
    if (active !== opening) return;
    current = outbox;
    unsubscribe = outbox.subscribe(notify);
    notify();
    void outbox.drain();
  });
  return opening;
};

/** Closes the outbox; `remove` then deletes its database (sign-out). */
export const stopOutbox = async (remove?: () => Promise<void>) => {
  const closing = active;
  active = null;
  current = null;
  context = null;
  unsubscribe?.();
  unsubscribe = null;
  notify();
  const outbox = await closing?.catch(() => null);
  await outbox?.close();
  await remove?.();
};

export const activeOutbox = () => current;

/** Takes Notebook writes before auth runs, so an offline write never waits on a token. */
export const outboxMiddleware: ApiMiddleware = {
  async onRequest({ request }) {
    if (request.headers.has(OUTBOX_SEND_HEADER)) {
      const headers = new Headers(request.headers);
      headers.delete(OUTBOX_SEND_HEADER);
      return new Request(request, { headers });
    }
    const outbox = await active?.catch(() => null);
    return (await outbox?.submit(request)) ?? undefined;
  },
};

export const subscribeOutbox = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Edits waiting to reach the server, failed ones excluded. */
export const outboxPendingCount = () =>
  current ? current.count() - current.failedCount() : 0;

/** Edits the server refused; they wait for a decision. */
export const outboxFailedCount = () => current?.failedCount() ?? 0;

export const hasLocalEdits = (id: string) => current?.hasEntity(id) ?? false;

export const drainOutbox = () => current?.drain();

export const outboxConflicts = () => conflictList;

/** What the user can do about a conflict; which apply depends on its kind. */
export type Resolution =
  'mine' | 'theirs' | 'copy' | 'restore' | 'merge' | 'saved' | 'discard';

const recreate = async (
  client: ApiClient,
  queryClient: QueryClient,
  local: Entity,
  type: EntityType,
): Promise<string> => {
  const id = createUlid();
  if (type === 'note') {
    const note = local as Note;
    const { data } = await client.POST('/api/notebook/notes', {
      body: {
        id,
        area: note.area,
        type: 'page',
        title: note.title,
        bodyMarkdown: note.bodyMarkdown,
        tags: note.tags,
        pinned: note.pinned,
      },
    });
    if (data) writeEntity(queryClient, data as Note, 'note');
  } else {
    const task = local as Task;
    const { data } = await client.POST('/api/notebook/tasks', {
      body: {
        id,
        area: task.area,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        startDate: task.someday ? null : task.startDate,
        someday: task.someday,
        noteId: task.noteId,
        tags: task.tags,
      },
    });
    if (data) writeEntity(queryClient, data as Task, 'task');
  }
  return id;
};

/**
 * Applies the user's choice. `copy` (a note's text as a new page) and
 * `restore` (an entity deleted elsewhere, created again) return the new id.
 */
export const resolveConflict = async (
  entityId: string,
  choice: Resolution,
): Promise<string | undefined> => {
  const outbox = current;
  const ctx = context;
  const conflict = conflictList.find((c) => c.entityId === entityId);
  if (!outbox || !ctx || !conflict) return undefined;
  switch (choice) {
    case 'mine':
      await outbox.keepMine(entityId);
      return undefined;
    case 'theirs':
      await outbox.keepTheirs(entityId);
      return undefined;
    case 'merge':
      await outbox.mergeDaily(entityId);
      return undefined;
    case 'saved':
      await outbox.useSavedDaily(entityId);
      return undefined;
    case 'discard': {
      await outbox.discard(entityId);
      const keys =
        conflict.entity === 'note' ? queryKeys.notes : queryKeys.tasks;
      await ctx.queryClient.invalidateQueries({ queryKey: keys.all });
      return undefined;
    }
    case 'copy':
    case 'restore': {
      const local = findCached(ctx.queryClient, conflict.entity, entityId);
      if (!local) return undefined;
      const id = await recreate(
        ctx.client,
        ctx.queryClient,
        local,
        conflict.entity,
      );
      await outbox.keepTheirs(entityId);
      return id;
    }
  }
};

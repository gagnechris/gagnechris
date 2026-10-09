import type { ApiClient, ApiMiddleware } from '@gagnechris/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import { findCached, writeEntity } from '../sync/syncFeed';
import { upgradeRequired } from '../sync/upgradeRequired';
import type { Op } from './ops';
import { Outbox } from './outbox';
import type { OutboxDb } from './store';

/** Marks a request the outbox itself sends, so the middleware lets it through. */
export const OUTBOX_SEND_HEADER = 'x-gagnechris-outbox-send';

let active: Promise<Outbox> | null = null;
let current: Outbox | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

const notify = () => {
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
  const opening = db().then((database) =>
    Outbox.open({
      db: database,
      send: sendThrough(client),
      lookup: (entity, id) => findCached(queryClient, entity, id),
      onSaved: (entity, saved) => writeEntity(queryClient, saved, entity),
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

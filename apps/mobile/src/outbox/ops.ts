import type { Note, Task } from '@gagnechris/app-core';
import { deepEqual, taskEmbedIds } from '@gagnechris/shared';

export type EntityType = 'note' | 'task';

export type OpKind =
  'create' | 'update' | 'daily' | 'delete' | 'complete' | 'reopen';

export type OpMethod = 'POST' | 'PUT' | 'DELETE';

export type Body = Record<string, unknown>;

export type OpTarget = {
  entity: EntityType;
  entityId: string;
  kind: OpKind;
};

export type Op = OpTarget & {
  seq: number;
  method: OpMethod;
  /** From `/api/notebook`, so it resends through the same client. */
  path: string;
  body: Body;
  /** The local values of the fields `body` changes, before the first unsent edit. */
  base: Body;
  /** Attempted at least once; its body is frozen from then on. */
  sent: boolean;
  state: 'pending' | 'failed';
  /** The refusing response of a failed op. */
  status: number | null;
  error: unknown;
};

export type Entity = Note | Task;

const NOTEBOOK_PATH = /\/api\/notebook\/(notes|tasks)(?:\/([^?]*))?$/;

/** The write a request makes, or null for reads and endpoints the outbox leaves alone. */
export const classifyWrite = (
  method: string,
  pathname: string,
  body: Body,
): (OpTarget & { path: string; method: OpMethod }) | null => {
  const match = NOTEBOOK_PATH.exec(pathname);
  if (!match || (method !== 'POST' && method !== 'PUT' && method !== 'DELETE'))
    return null;
  const path = pathname.slice(match.index);
  const entity: EntityType = match[1] === 'notes' ? 'note' : 'task';
  const rest = (match[2] ?? '').split('/').filter(Boolean);
  const bodyId = typeof body.id === 'string' ? body.id : null;
  const write = (entityId: string | null, kind: OpKind) =>
    entityId
      ? { entity, entityId, kind, path, method: method as OpMethod }
      : null;
  if (rest.length === 0) {
    return method === 'POST' ? write(bodyId, 'create') : null;
  }
  const [id, action] = rest;
  if (id === 'batch' || id === 'search') return null;
  if (entity === 'note' && id === 'daily') {
    // `/daily/{area}/{date}/open` reads the day, creating it at most once.
    return method === 'PUT' && rest.length === 3
      ? write(bodyId, 'daily')
      : null;
  }
  if (rest.length === 1) {
    if (method === 'PUT') return write(id!, 'update');
    if (method === 'DELETE') return write(id!, 'delete');
    return null;
  }
  if (
    entity === 'task' &&
    method === 'POST' &&
    rest.length === 2 &&
    (action === 'complete' || action === 'reopen')
  ) {
    return write(id!, action);
  }
  return null;
};

export const baseVersion = (body: Body): number | undefined =>
  typeof body.version === 'number' ? body.version : undefined;

export const fieldsOf = (body: Body): Body => {
  const { version: _version, id: _id, ...fields } = body;
  return fields;
};

/** The version the server will hold after `op`, if nobody else writes first. */
export const versionAfter = (op: Pick<Op, 'kind' | 'body'>): number => {
  if (op.kind === 'create') return 1;
  const base = baseVersion(op.body);
  return base === undefined ? 1 : base + 1;
};

const sameEntity = (a: OpTarget, b: OpTarget) =>
  a.entity === b.entity && a.entityId === b.entityId;

const isFieldWrite = (kind: OpKind) =>
  kind === 'update' || kind === 'daily' || kind === 'create';

// The API stores a cleared field (null) by omitting it.
const same = (a: unknown, b: unknown) => deepEqual(a ?? null, b ?? null);

/** What `body` changes, as the local copy held it before. */
export const baseOf = (body: Body, current: Entity | undefined): Body => {
  if (!current) return {};
  const values = current as unknown as Body;
  return Object.fromEntries(
    Object.keys(fieldsOf(body)).map((key) => [key, values[key] ?? null]),
  );
};

export type EnqueuePlan =
  /** Rewrite `seq`'s body; the new op is absorbed into it. */
  | { type: 'merge'; seq: number; body: Body; base: Body; path?: string }
  /** Append the op, after dropping `drop`. */
  | { type: 'append'; drop: number[]; body: Body }
  /** A create and delete that never left the phone: drop both, send nothing. */
  | { type: 'vanish'; drop: number[] };

/**
 * How a new write joins the queue. Only an op that has never been attempted
 * may change; an attempted one might have landed with exactly its body.
 */
export const planEnqueue = (
  queue: readonly Op[],
  next: OpTarget & { path: string; body: Body; base: Body },
  inFlight: number | null,
): EnqueuePlan => {
  const mine = queue.filter((op) => sameEntity(op, next));
  const editable = (op: Op) =>
    !op.sent && op.state === 'pending' && op.seq !== inFlight;
  const last = mine.at(-1);

  if (next.kind === 'delete') {
    let from = mine.length;
    while (from > 0 && editable(mine[from - 1]!)) from -= 1;
    const tail = mine.slice(from);
    const drop = tail.map((op) => op.seq);
    if (tail.some((op) => op.kind === 'create'))
      return { type: 'vanish', drop };
    const base = tail[0] && baseVersion(tail[0].body);
    const body =
      base === undefined ? next.body : { ...next.body, version: base };
    return { type: 'append', drop, body };
  }

  if (last && editable(last)) {
    if (isFieldWrite(next.kind) && isFieldWrite(last.kind)) {
      return {
        type: 'merge',
        seq: last.seq,
        body: { ...last.body, ...fieldsOf(next.body) },
        // The earliest base of each field: what the server held before any of it.
        base: { ...next.base, ...last.base },
      };
    }
    if (
      (next.kind === 'complete' || next.kind === 'reopen') &&
      (last.kind === 'complete' || last.kind === 'reopen')
    ) {
      return {
        type: 'merge',
        seq: last.seq,
        body: last.body,
        base: last.base,
        path: next.path,
      };
    }
  }
  return { type: 'append', drop: [], body: next.body };
};

/** Every unsent op on the entity, in order, re-based on what the server returned. */
export const rebase = (
  queue: readonly Op[],
  target: OpTarget,
  serverVersion: number,
): { seq: number; body: Body }[] => {
  let version = serverVersion;
  const out: { seq: number; body: Body }[] = [];
  for (const op of queue) {
    if (!sameEntity(op, target) || op.kind === 'create') continue;
    if (baseVersion(op.body) !== version) {
      out.push({ seq: op.seq, body: { ...op.body, version } });
    }
    version += 1;
  }
  return out;
};

/** Ids an op needs to exist on the server first. */
export const dependsOn = (op: Op): string[] => {
  const ids: string[] = [];
  if (op.entity === 'task' && typeof op.body.noteId === 'string') {
    ids.push(op.body.noteId);
  }
  if (op.entity === 'note' && typeof op.body.bodyMarkdown === 'string') {
    ids.push(...taskEmbedIds(op.body.bodyMarkdown));
  }
  return ids;
};

const noteFromCreate = (
  id: string,
  body: Body,
  now: string,
  current?: Note,
): Note => ({
  id,
  userId: current?.userId ?? '',
  area: (body.area as Note['area']) ?? current?.area ?? 'work',
  type: (body.type as Note['type']) ?? current?.type ?? 'page',
  date: (body.date as string | undefined) ?? current?.date ?? null,
  title: (body.title as string | undefined) ?? '',
  bodyMarkdown: (body.bodyMarkdown as string | undefined) ?? '',
  tags: (body.tags as string[] | undefined) ?? [],
  pinned: (body.pinned as boolean | undefined) ?? false,
  taskIds: taskEmbedIds((body.bodyMarkdown as string | undefined) ?? ''),
  version: 1,
  createdAt: now,
  updatedAt: now,
  deleted: false,
});

const taskFromCreate = (id: string, body: Body, now: string): Task => ({
  id,
  userId: '',
  area: body.area as Task['area'],
  title: body.title as string,
  description: (body.description as string | undefined) ?? '',
  priority: (body.priority as Task['priority'] | undefined) ?? 'med',
  status: (body.status as Task['status'] | undefined) ?? 'todo',
  dueDate: (body.dueDate as string | null | undefined) ?? null,
  startDate: body.someday
    ? null
    : ((body.startDate as string | null | undefined) ?? null),
  someday: (body.someday as boolean | undefined) ?? false,
  completedAt: null,
  noteId: (body.noteId as string | null | undefined) ?? null,
  tags: (body.tags as string[] | undefined) ?? [],
  version: 1,
  createdAt: now,
  updatedAt: now,
  deleted: false,
});

const patchTask = (task: Task, fields: Body): Task => {
  const next = { ...task, ...fields } as Task;
  if (fields.someday === true) next.startDate = null;
  if (typeof fields.startDate === 'string') next.someday = false;
  return next;
};

/**
 * What the server would answer if the op landed now: the reply the caller
 * gets while the op waits in the queue. `current` is the latest local copy.
 */
export const project = (
  op: Pick<Op, 'entity' | 'entityId' | 'kind' | 'body'>,
  current: Entity | undefined,
  version: number,
  now: string,
): Entity | undefined => {
  const fields = fieldsOf(op.body);
  if (op.kind === 'create' || (op.kind === 'daily' && !current)) {
    const created =
      op.entity === 'note'
        ? noteFromCreate(op.entityId, op.body, now, current as Note)
        : taskFromCreate(op.entityId, op.body, now);
    return { ...created, version };
  }
  if (!current) return undefined;
  const stamp = { version, updatedAt: now };
  switch (op.kind) {
    case 'update':
    case 'daily':
      if (op.entity === 'task') {
        return { ...patchTask(current as Task, fields), ...stamp };
      }
      return {
        ...(current as Note),
        ...fields,
        ...(typeof fields.bodyMarkdown === 'string'
          ? { taskIds: taskEmbedIds(fields.bodyMarkdown) }
          : {}),
        ...stamp,
      } as Note;
    case 'delete':
      return { ...current, deleted: true, ...stamp };
    case 'complete':
      return {
        ...(current as Task),
        status: 'done',
        completedAt: now,
        ...stamp,
      };
    case 'reopen':
      return {
        ...(current as Task),
        status: 'todo',
        completedAt: null,
        ...stamp,
      };
  }
};

/** A 412 whose `current` already holds the op's fields: the op landed earlier. */
export const alreadyApplied = (op: Op, current: unknown): boolean => {
  if (!current || typeof current !== 'object') return false;
  const server = current as Record<string, unknown>;
  switch (op.kind) {
    case 'delete':
      return server.deleted === true;
    case 'complete':
      return server.status === 'done';
    case 'reopen':
      return server.status !== 'done';
    default:
      return Object.entries(fieldsOf(op.body)).every(([key, value]) =>
        same(server[key], value),
      );
  }
};

/** The fields the op changes that the server also changed since its base. */
export const conflictingFields = (op: Op, current: Entity): string[] => {
  const server = current as unknown as Body;
  return Object.entries(fieldsOf(op.body))
    .filter(
      ([key, value]) =>
        !same(server[key], value) &&
        (!(key in op.base) || !same(server[key], op.base[key])),
    )
    .map(([key]) => key);
};

/**
 * The body to re-send on top of `current` after a version conflict, or null
 * when the user has to choose: field writes merge where the server left the
 * field alone, and complete and reopen apply to any version.
 */
export const autoMerge = (op: Op, current: Entity): Body | null => {
  if (current.deleted) return null;
  switch (op.kind) {
    case 'update':
    case 'daily':
      return conflictingFields(op, current).length === 0
        ? { ...op.body, version: current.version }
        : null;
    case 'complete':
    case 'reopen':
      return { ...op.body, version: current.version };
    default:
      return null;
  }
};

/** Why the server refused an op the user has to decide about. */
export type ConflictKind = 'changed' | 'deleted' | 'daily_taken' | 'refused';

type Refusal = { error?: unknown; current?: unknown; message?: unknown };

const refusalOf = (body: unknown): Refusal =>
  body && typeof body === 'object' ? (body as Refusal) : {};

/** The server's copy a refusal carries, when it has one. */
export const serverCopy = (body: unknown): Entity | undefined => {
  const { current } = refusalOf(body);
  return current && typeof current === 'object'
    ? (current as Entity)
    : undefined;
};

export const refusalMessage = (body: unknown): string | undefined => {
  const { message } = refusalOf(body);
  return typeof message === 'string' ? message : undefined;
};

/** Null for a refusal the outbox treats as an error, not a conflict. */
export const conflictOf = (
  status: number,
  body: unknown,
): Exclude<ConflictKind, 'refused'> | null => {
  const { error } = refusalOf(body);
  if (status === 409 && error === 'deleted') return 'deleted';
  if (status === 409 && error === 'daily_taken' && serverCopy(body))
    return 'daily_taken';
  if (
    (status === 412 || (status === 409 && error === 'version_conflict')) &&
    serverCopy(body)
  )
    return 'changed';
  return null;
};

/**
 * The phone's daily note text under the winner's, without the embed lines
 * for tasks the winner already embeds (both days may carry the same ones in).
 */
export const mergeDailyText = (winner: string, local: string): string => {
  const embedded = new Set(taskEmbedIds(winner));
  const kept = local
    .split('\n')
    .filter((line) => {
      const ids = taskEmbedIds(line);
      return ids.length === 0 || ids.some((id) => !embedded.has(id));
    })
    .join('\n')
    .trim();
  const base = winner.replace(/\s+$/, '');
  if (!kept || base.includes(kept)) return winner;
  return base ? `${base}\n\n${kept}\n` : `${kept}\n`;
};

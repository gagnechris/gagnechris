import type { Note, Task } from '@gagnechris/app-core';
import { taskEmbedIds } from '@gagnechris/shared';

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

const fieldsOf = (body: Body): Body => {
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

export type EnqueuePlan =
  /** Rewrite `seq`'s body; the new op is absorbed into it. */
  | { type: 'merge'; seq: number; body: Body; path?: string }
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
  next: OpTarget & { path: string; body: Body },
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
      };
    }
    if (
      (next.kind === 'complete' || next.kind === 'reopen') &&
      (last.kind === 'complete' || last.kind === 'reopen')
    ) {
      return { type: 'merge', seq: last.seq, body: last.body, path: next.path };
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
      return Object.entries(fieldsOf(op.body)).every(
        ([key, value]) => JSON.stringify(server[key]) === JSON.stringify(value),
      );
  }
};

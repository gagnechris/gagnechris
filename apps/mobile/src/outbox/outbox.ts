import type { Note } from '@gagnechris/app-core';
import {
  alreadyApplied,
  autoMerge,
  baseOf,
  classifyWrite,
  conflictOf,
  dependsOn,
  mergeDailyText,
  planEnqueue,
  project,
  rebase,
  serverCopy,
  versionAfter,
  type Body,
  type Entity,
  type EntityType,
  type Op,
  type OpKind,
  type OpMethod,
} from './ops';
import {
  deleteOps,
  insertOp,
  loadOps,
  markFailed,
  markSent,
  migrate,
  requeueOp,
  rewriteOp,
  type OutboxDb,
} from './store';

export type OutboxDeps = {
  db: OutboxDb;
  /** Sends a queued op through the API client, past the outbox. */
  send: (op: Op) => Promise<Response>;
  /** The latest local copy (query cache), for the reply while an op waits. */
  lookup: (entity: EntityType, id: string) => Entity | undefined;
  /** A queued op landed; the cache takes the server's copy. */
  onSaved: (entity: EntityType, saved: Entity) => void;
  /** The cache takes this copy even over a newer local one (a conflict resolved). */
  onReplaced: (entity: EntityType, copy: Entity) => void;
  /** A daily note that lost its day: the cache forgets it. */
  onDropped: (entity: EntityType, id: string) => void;
  /** Ids of cached tasks whose home note is `noteId`. */
  tasksInNote: (noteId: string) => string[];
  isOnline: () => boolean;
  now?: () => string;
};

type Waiter = { resolve: (response: Response) => void; optimistic: Response };

type Target = {
  entity: EntityType;
  entityId: string;
  kind: OpKind;
  path: string;
  method: OpMethod;
  body: Body;
};

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const retryable = (status: number) =>
  status === 408 || status === 429 || status >= 500;

/**
 * A durable FIFO of Notebook writes. A write is stored before it is sent;
 * the caller gets the server's reply when it arrives in this drain, and
 * otherwise (offline, server failing, blocked behind a failed op) the reply
 * the server would give, so editors and lists move on while the op waits.
 */
export class Outbox {
  private ops: Op[] = [];
  private inFlight: number | null = null;
  private draining: Promise<void> | null = null;
  private rerun = false;
  private waiters = new Map<number, Waiter[]>();
  private listeners = new Set<() => void>();
  private lock: Promise<unknown> = Promise.resolve();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private closed = false;
  private readonly now: () => string;

  private constructor(private readonly deps: OutboxDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  static async open(deps: OutboxDeps): Promise<Outbox> {
    await migrate(deps.db);
    const outbox = new Outbox(deps);
    outbox.ops = await loadOps(deps.db);
    return outbox;
  }

  /** Ops not yet on the server, failed ones included. */
  count = () => this.ops.length;

  failedCount = () => this.ops.filter((op) => op.state === 'failed').length;

  hasEntity = (id: string) => this.ops.some((op) => op.entityId === id);

  pending = (): readonly Op[] => this.ops;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lock.then(task, task);
    this.lock = run.catch(() => undefined);
    return run;
  }

  /**
   * Takes over a Notebook write. Undefined for anything else, and for an
   * update of an entity the phone holds no copy of (it goes out as usual).
   */
  async submit(request: Request): Promise<Response | undefined> {
    if (this.closed) return undefined;
    const text = await request.clone().text();
    const body = (text ? JSON.parse(text) : {}) as Body;
    const target = classifyWrite(
      request.method,
      new URL(request.url).pathname,
      body,
    );
    if (!target) return undefined;

    const queued = await this.serial(() => this.enqueue({ ...target, body }));
    if (!queued) return undefined;
    if (queued.seq === null || !this.deps.isOnline()) return queued.optimistic;
    const reply = new Promise<Response>((resolve) => {
      const list = this.waiters.get(queued.seq!) ?? [];
      list.push({ resolve, optimistic: queued.optimistic });
      this.waiters.set(queued.seq!, list);
    });
    void this.drain();
    return reply;
  }

  private async enqueue(
    next: Target,
  ): Promise<
    { seq: number | null; optimistic: Response; entity?: Entity } | undefined
  > {
    const { db } = this.deps;
    const current = this.deps.lookup(next.entity, next.entityId);
    const base = baseOf(next.body, current);
    const plan = planEnqueue(this.ops, { ...next, base }, this.inFlight);
    const status = next.kind === 'create' ? 201 : 200;

    if (plan.type === 'vanish') {
      const gone = current && {
        ...current,
        deleted: true,
        updatedAt: this.now(),
      };
      await db.withTransactionAsync(() => deleteOps(db, plan.drop));
      this.ops = this.ops.filter((op) => !plan.drop.includes(op.seq));
      this.notify();
      return {
        seq: null,
        optimistic: jsonResponse(gone ?? {}, 200),
        entity: gone,
      };
    }

    const merged =
      plan.type === 'merge'
        ? this.ops.find((op) => op.seq === plan.seq)!
        : undefined;
    // Never below the local copy: a delete that drops queued edits is based
    // on an older version, and a lower tombstone would lose to the cache.
    const version = Math.max(
      versionAfter({ kind: merged?.kind ?? next.kind, body: plan.body }),
      current?.version ?? 0,
    );
    const entity = project(next, current, version, this.now());
    if (!entity) return undefined;
    const optimistic = jsonResponse(entity, status);

    if (plan.type === 'merge') {
      const path = plan.path ?? merged!.path;
      await rewriteOp(db, plan.seq, plan.body, path, plan.base);
      merged!.body = plan.body;
      merged!.path = path;
      merged!.base = plan.base;
      return { seq: plan.seq, optimistic, entity };
    }

    let seq = 0;
    await db.withTransactionAsync(async () => {
      await deleteOps(db, plan.drop);
      seq = await insertOp(db, { ...next, body: plan.body, base });
    });
    this.ops = this.ops.filter((op) => !plan.drop.includes(op.seq));
    this.ops.push({
      ...next,
      body: plan.body,
      base,
      seq,
      sent: false,
      state: 'pending',
      status: null,
      error: null,
    });
    this.notify();
    return { seq, optimistic, entity };
  }

  /** The first op that may go now: failures block their entity and what depends on it. */
  private nextSendable(): Op | undefined {
    const blocked = new Set<string>();
    for (const op of this.ops) {
      if (op.state === 'failed' || blocked.has(op.entityId)) {
        blocked.add(op.entityId);
        continue;
      }
      if (dependsOn(op).some((id) => blocked.has(id))) {
        blocked.add(op.entityId);
        continue;
      }
      return op;
    }
    return undefined;
  }

  /** Sends queued ops in order until the queue is empty or a send can't finish. */
  drain(): Promise<void> {
    if (this.draining) {
      // An op queued while the last pass was finishing still goes out now.
      this.rerun = true;
      return this.draining;
    }
    this.clearRetry();
    this.draining = (async () => {
      do {
        this.rerun = false;
        await this.runDrain();
      } while (this.rerun && !this.closed && !this.retryTimer);
    })().finally(() => {
      this.draining = null;
      this.settleWaiters();
    });
    return this.draining;
  }

  private async runDrain() {
    while (!this.closed && this.deps.isOnline()) {
      const op = await this.serial(async () => {
        const next = this.nextSendable();
        if (!next) return undefined;
        this.inFlight = next.seq;
        if (!next.sent) {
          await markSent(this.deps.db, next.seq);
          next.sent = true;
        }
        return next;
      });
      if (!op) return;
      let response: Response;
      try {
        response = await this.deps.send(op);
      } catch {
        this.inFlight = null;
        // Offline, or the connection dropped: the next online signal resumes.
        if (this.deps.isOnline()) this.scheduleRetry();
        return;
      }
      const keepGoing = await this.serial(() => this.settle(op, response));
      this.inFlight = null;
      if (!keepGoing) return;
    }
  }

  private async settle(op: Op, response: Response): Promise<boolean> {
    const status = response.status;
    if (retryable(status)) {
      this.scheduleRetry();
      return false;
    }
    const body = await readJson(response);
    const current = serverCopy(body);
    const landed =
      status < 300
        ? (body as Entity)
        : (status === 409 || status === 412) && alreadyApplied(op, current)
          ? current
          : undefined;

    if (landed) {
      this.retryDelay = RETRY_MIN_MS;
      await this.remove([op.seq], op, landed.version);
      this.deps.onSaved(op.entity, landed);
      this.resolveWaiters(op.seq, () =>
        jsonResponse(landed, status < 300 ? status : 200),
      );
      this.notify();
      return true;
    }

    const conflict = conflictOf(status, body);
    if (conflict === 'changed') {
      const retry = autoMerge(op, current!);
      if (retry) {
        await this.rewrite(op, retry, current!.version);
        return true;
      }
    }
    if (
      conflict === 'daily_taken' &&
      !String(op.body.bodyMarkdown ?? '').trim()
    ) {
      // Nothing typed yet, so nothing is lost by taking the other device's day.
      await this.adopt(op.entityId, current as Note);
      this.resolveWaiters(op.seq, () => jsonResponse(current, 200));
      return true;
    }

    if (!conflict && this.waiters.has(op.seq)) {
      // The caller is still waiting, so it handles the error itself, as it
      // would without the outbox (a payload too large shows its message).
      await deleteOps(this.deps.db, [op.seq]);
      this.ops = this.ops.filter((other) => other.seq !== op.seq);
      this.resolveWaiters(op.seq, () => jsonResponse(body, status));
      this.notify();
      return true;
    }

    // Parked until the user decides; the caller moves on with its local copy.
    await markFailed(this.deps.db, op.seq, status, body);
    op.state = 'failed';
    op.status = status;
    op.error = body;
    this.resolveWaiters(op.seq, (waiter) => waiter.optimistic);
    this.notify();
    return true;
  }

  /** Drops `seqs` and renumbers the entity's other ops from `version`. */
  private async remove(seqs: number[], target: Op, version: number) {
    const { db } = this.deps;
    const rest = this.ops.filter((other) => !seqs.includes(other.seq));
    const rebased = rebase(rest, target, version);
    await db.withTransactionAsync(async () => {
      await deleteOps(db, seqs);
      for (const { seq, body } of rebased) {
        const queued = rest.find((other) => other.seq === seq)!;
        await rewriteOp(db, seq, body, queued.path, queued.base);
        queued.body = body;
      }
    });
    this.ops = rest;
  }

  /** Puts `op` back in line on top of the server's `version`, with `body`. */
  private async rewrite(op: Op, body: Body, version: number) {
    const { db } = this.deps;
    const rebased = rebase(
      this.ops.filter((other) => other.seq !== op.seq),
      op,
      version + 1,
    );
    await db.withTransactionAsync(async () => {
      await requeueOp(db, op.seq, body);
      for (const { seq, body: next } of rebased) {
        const queued = this.ops.find((other) => other.seq === seq)!;
        await rewriteOp(db, seq, next, queued.path, queued.base);
        queued.body = next;
      }
    });
    op.body = body;
    op.state = 'pending';
    op.status = null;
    op.error = null;
  }

  /**
   * The day belongs to `winner`: the losing note's ops go, unsent task creates
   * move to the winner, and tasks already on the server get an update.
   */
  private async adopt(loserId: string, winner: Note) {
    const { db } = this.deps;
    const losing = this.ops.filter((op) => op.entityId === loserId);
    const moved = this.ops.filter(
      (op) => op.entity === 'task' && !op.sent && op.body.noteId === loserId,
    );
    await db.withTransactionAsync(async () => {
      await deleteOps(
        db,
        losing.map((op) => op.seq),
      );
      for (const op of moved) {
        op.body = { ...op.body, noteId: winner.id };
        await rewriteOp(db, op.seq, op.body, op.path, op.base);
      }
    });
    this.ops = this.ops.filter((op) => op.entityId !== loserId);
    this.deps.onDropped('note', loserId);
    this.deps.onReplaced('note', winner);
    const queuedCreates = new Set(moved.map((op) => op.entityId));
    for (const id of this.deps.tasksInNote(loserId)) {
      if (queuedCreates.has(id)) continue;
      const task = this.deps.lookup('task', id);
      if (!task) continue;
      const queued = await this.enqueue({
        entity: 'task',
        entityId: id,
        kind: 'update',
        method: 'PUT',
        path: `/api/notebook/tasks/${id}`,
        body: { version: task.version, noteId: winner.id },
      });
      if (queued?.entity) this.deps.onSaved('task', queued.entity);
    }
    this.notify();
  }

  /** Ops the server refused, one per entity, waiting for the user. */
  conflicts = (): readonly Op[] =>
    this.ops.filter((op) => op.state === 'failed');

  conflictFor = (entityId: string): Op | undefined =>
    this.ops.find((op) => op.entityId === entityId && op.state === 'failed');

  private parked(entityId: string) {
    const op = this.conflictFor(entityId);
    if (!op) throw new Error(`No conflict on ${entityId}`);
    return op;
  }

  /** Sends the phone's version over the server's. */
  keepMine(entityId: string) {
    return this.resolve(async () => {
      const op = this.parked(entityId);
      const current = serverCopy(op.error);
      if (!current || current.deleted) throw new Error('Nothing to overwrite');
      await this.rewrite(
        op,
        { ...op.body, version: current.version },
        current.version,
      );
    });
  }

  /** Drops the phone's edits to the entity; the cache takes the server's copy. */
  keepTheirs(entityId: string) {
    return this.resolve(async () => {
      const op = this.parked(entityId);
      const current = serverCopy(op.error);
      await this.dropEntity(entityId);
      const copy =
        current ??
        (() => {
          const local = this.deps.lookup(op.entity, entityId);
          return local && { ...local, deleted: true };
        })();
      if (copy) this.deps.onReplaced(op.entity, copy);
    });
  }

  /** Drops the phone's edits to the entity and leaves the cache to refetch. */
  discard(entityId: string) {
    return this.resolve(() => this.dropEntity(entityId));
  }

  /** The other device's daily note wins and the phone's text is dropped. */
  useSavedDaily(entityId: string) {
    return this.resolve(async () => {
      const op = this.parked(entityId);
      await this.adopt(entityId, serverCopy(op.error) as Note);
    });
  }

  /** The phone's daily note text goes under the other device's. */
  mergeDaily(entityId: string) {
    return this.resolve(async () => {
      const op = this.parked(entityId);
      const winner = serverCopy(op.error) as Note;
      const local = this.deps.lookup('note', entityId) as Note | undefined;
      const typed = local?.bodyMarkdown ?? String(op.body.bodyMarkdown ?? '');
      await this.adopt(entityId, winner);
      const merged = mergeDailyText(winner.bodyMarkdown, typed);
      if (merged === winner.bodyMarkdown) return;
      const queued = await this.enqueue({
        entity: 'note',
        entityId: winner.id,
        kind: 'update',
        method: 'PUT',
        path: `/api/notebook/notes/${winner.id}`,
        body: { version: winner.version, bodyMarkdown: merged },
      });
      if (queued?.entity) this.deps.onReplaced('note', queued.entity);
    });
  }

  private async dropEntity(entityId: string) {
    const seqs = this.ops
      .filter((op) => op.entityId === entityId)
      .map((op) => op.seq);
    await this.deps.db.withTransactionAsync(() =>
      deleteOps(this.deps.db, seqs),
    );
    this.ops = this.ops.filter((op) => op.entityId !== entityId);
  }

  private async resolve(task: () => Promise<void>) {
    await this.serial(task);
    this.notify();
    void this.drain();
  }

  private resolveWaiters(seq: number, response: (waiter: Waiter) => Response) {
    const list = this.waiters.get(seq);
    if (!list) return;
    this.waiters.delete(seq);
    for (const waiter of list) waiter.resolve(response(waiter));
  }

  private settleWaiters() {
    for (const [seq, list] of this.waiters) {
      this.waiters.delete(seq);
      for (const waiter of list) waiter.resolve(waiter.optimistic);
    }
  }

  private scheduleRetry() {
    if (this.retryTimer || this.closed) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.drain();
    }, delay);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  async close() {
    this.closed = true;
    this.clearRetry();
    await this.draining;
    this.settleWaiters();
    await this.lock;
    await this.deps.db.closeAsync();
  }
}

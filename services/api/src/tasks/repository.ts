/**
 * Uses VersionedRepository (owner-scoped) with @gagnechris/data mappers/keys.
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  GSI1_NAME,
  GSI2_NAME,
  buildTaskMetaItem,
  keys,
  metaToTask,
  normalizeTags,
  parseTaskMetaItem,
  taskGsi1SkRanges,
  type SortKeyRange,
  type TaskMetaItem,
} from '@gagnechris/data';
import {
  OPEN_TASK_STATUSES,
  TaskStatusSchema,
  TaskSyncChangeSchema,
  isOpenTaskStatus,
  taskMatchesSchedule,
  type CreateTaskRequest,
  type ListTasksQuery,
  type NotebookArea,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskRequest,
} from '@gagnechris/shared';
import {
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
  PRIMARY_CURSOR_KEYS,
} from '../data/cursor.js';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import {
  VersionedRepository,
  ownerScoped,
  type OwnerKey,
} from '../data/versioned-repository.js';
import { PAGE_BYTE_BUDGET } from '../data/page-budget.js';
import { walkPartitions } from '../data/partition-walk.js';
import { hashCreateFields } from '../data/create-hash.js';
import { toSyncChange } from '../sync/to-sync-change.js';

export const TASK_CHANGE_TYPE = 'task';

const ALL_AREAS: NotebookArea[] = ['work', 'personal'];
const ALL_STATUSES: readonly TaskStatus[] = TaskStatusSchema.options;
const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  med: 1,
  low: 2,
};

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function taskCreatePayloadHash(
  t: Pick<
    Task,
    | 'userId'
    | 'area'
    | 'title'
    | 'description'
    | 'priority'
    | 'status'
    | 'dueDate'
    | 'startDate'
    | 'someday'
    | 'noteId'
    | 'tags'
  >,
): string {
  // Unscheduled creates hash exactly as before startDate existed, so a replay
  // of an older create still matches its stored createHash.
  const schedule =
    t.startDate !== null || t.someday
      ? [t.startDate ?? '', t.someday ? 'someday' : '']
      : [];
  return hashCreateFields([
    t.userId,
    t.area,
    t.title,
    t.description,
    t.priority,
    t.status,
    t.dueDate ?? '',
    t.noteId ?? '',
    t.tags.join(','),
    ...schedule,
  ]);
}

export const taskToChange = toSyncChange(
  TASK_CHANGE_TYPE,
  (item) => metaToTask(parseTaskMetaItem(item)),
  TaskSyncChangeSchema,
);

function isCarriedOver(task: Task, today: string): boolean {
  return (
    isOpenTaskStatus(task.status) &&
    task.startDate !== null &&
    task.startDate < today
  );
}

/** Carried over (open, started before today), then by startDate, undated, someday, priority, id. */
export function sortTasksForList(items: Task[], today: string): Task[] {
  return [...items].sort((a, b) => {
    const aCarried = isCarriedOver(a, today) ? 0 : 1;
    const bCarried = isCarriedOver(b, today) ? 0 : 1;
    if (aCarried !== bCarried) return aCarried - bCarried;

    if (a.someday !== b.someday) return a.someday ? 1 : -1;
    if (a.startDate === null && b.startDate !== null) return 1;
    if (a.startDate !== null && b.startDate === null) return -1;
    if (
      a.startDate !== null &&
      b.startDate !== null &&
      a.startDate !== b.startDate
    ) {
      return a.startDate < b.startDate ? -1 : 1;
    }

    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function matchesListQuery(task: Task, query: ListTasksQuery): boolean {
  if (query.area && task.area !== query.area) return false;
  if (query.status && task.status !== query.status) return false;
  if (!query.status && query.open && !isOpenTaskStatus(task.status)) {
    return false;
  }
  if (query.priority && task.priority !== query.priority) return false;
  if (query.dueOn && task.dueDate !== query.dueOn) return false;
  if (
    query.dueBefore &&
    (task.dueDate === null || task.dueDate >= query.dueBefore)
  ) {
    return false;
  }
  return taskMatchesSchedule(task, query);
}

/** One entry per GSI1 range to walk; `undefined` reads the whole partition. */
function scheduleRanges(query: ListTasksQuery): (SortKeyRange | undefined)[] {
  if (query.someday === true) return taskGsi1SkRanges.someday();
  if (query.startOn) return taskGsi1SkRanges.startOn(query.startOn);
  if (query.startOnOrBefore) {
    return taskGsi1SkRanges.showsOn(query.startOnOrBefore);
  }
  if (query.startAfter) return taskGsi1SkRanges.startsAfter(query.startAfter);
  return [undefined];
}

/** Someday wins: a task is either someday or scheduled, never both. */
export function applySchedule(
  existing: Pick<Task, 'startDate' | 'someday'>,
  body: { startDate?: string | null; someday?: boolean },
): Pick<Task, 'startDate' | 'someday'> {
  const someday =
    body.someday ??
    (body.startDate !== undefined && body.startDate !== null
      ? false
      : existing.someday);
  if (someday) return { startDate: null, someday: true };
  return {
    startDate:
      body.startDate !== undefined ? body.startDate : existing.startDate,
    someday: false,
  };
}

function withCompletedAt(
  status: TaskStatus,
  existingCompletedAt: string | null,
  now: string,
): string | null {
  if (status === 'done') {
    return existingCompletedAt ?? now;
  }
  return null;
}

/** Keeps a carried-in block readable; the rest stay in Still open. */
const CARRY_IN_MAX = 100;

export class TasksRepository {
  private readonly base: VersionedRepository<Task, TaskMetaItem, OwnerKey>;

  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    private readonly nowIso: Clock = systemClock,
  ) {
    this.base = new VersionedRepository<Task, TaskMetaItem, OwnerKey>(
      {
        conflictLabel: 'task',
        scope: ownerScoped({
          keyForId: (userId, id) => keys.notebook.task.meta(userId, id),
          idOf: (t) => t.id,
          userIdOf: (t) => t.userId,
        }),
        toEntity: (item) => metaToTask(parseTaskMetaItem(item)),
        toItem: buildTaskMetaItem,
        isDeleted: (t) => t.deleted,
        nowIso: this.nowIso,
        cursorKeyNames: PRIMARY_CURSOR_KEYS,
        cursorKeysByIndex: {
          [GSI1_NAME]: GSI1_CURSOR_KEYS,
          [GSI2_NAME]: GSI2_CURSOR_KEYS,
        },
        sync: {
          changeType: TASK_CHANGE_TYPE,
          userIdOf: (t) => t.userId,
          createPayloadHash: taskCreatePayloadHash,
        },
      },
      doc,
      tableName,
    );
  }

  get(userId: string, id: string): Promise<Task | undefined> {
    return this.base.get({ userId, id });
  }

  getOrThrow(userId: string, id: string): Promise<Task> {
    return this.base.getOrThrow({ userId, id });
  }

  createIdempotent(task: Task): Promise<Task> {
    return this.base.createIdempotent(task);
  }

  async createFromRequest(
    userId: string,
    body: CreateTaskRequest,
  ): Promise<Task> {
    const now = this.nowIso();
    const status = body.status;
    const task: Task = {
      id: body.id,
      userId,
      area: body.area,
      title: body.title,
      description: body.description,
      priority: body.priority,
      status,
      dueDate: body.dueDate ?? null,
      ...applySchedule(
        { startDate: null, someday: false },
        { startDate: body.startDate, someday: body.someday },
      ),
      completedAt: withCompletedAt(status, null, now),
      noteId: body.noteId ?? null,
      tags: normalizeTags(body.tags),
      version: 1,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    return this.createIdempotent(task);
  }

  updateFromRequest(
    userId: string,
    id: string,
    expected: number | 'any',
    body: Omit<UpdateTaskRequest, 'version'>,
  ): Promise<Task> {
    return this.base.mutateIfVersion(
      { userId, id },
      expected,
      (existing, now) => {
        const status = body.status ?? existing.status;
        return {
          ...existing,
          area: body.area ?? existing.area,
          title: body.title ?? existing.title,
          description: body.description ?? existing.description,
          priority: body.priority ?? existing.priority,
          status,
          dueDate: body.dueDate !== undefined ? body.dueDate : existing.dueDate,
          ...applySchedule(existing, body),
          noteId: body.noteId !== undefined ? body.noteId : existing.noteId,
          tags:
            body.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
          completedAt: withCompletedAt(status, existing.completedAt, now),
          updatedAt: now,
        };
      },
    );
  }

  complete(
    userId: string,
    id: string,
    expected: number | 'any',
  ): Promise<Task> {
    return this.base.mutateIfVersion(
      { userId, id },
      expected,
      (existing, now) => ({
        ...existing,
        status: 'done',
        completedAt: existing.completedAt ?? now,
        updatedAt: now,
      }),
    );
  }

  reopen(userId: string, id: string, expected: number | 'any'): Promise<Task> {
    // Reopen undoes done or dropped only; an in-progress task keeps its status.
    return this.base.mutateIfVersion(
      { userId, id },
      expected,
      (existing, now) => ({
        ...existing,
        status: isOpenTaskStatus(existing.status) ? existing.status : 'todo',
        completedAt: null,
        updatedAt: now,
      }),
    );
  }

  deleteIfVersion(
    userId: string,
    id: string,
    expected: number | 'any',
  ): Promise<Task> {
    return this.base.softDeleteIfVersion(
      { userId, id },
      expected,
      (t, now) => ({
        ...t,
        updatedAt: now,
        deleted: true,
      }),
    );
  }

  async list(
    userId: string,
    query: ListTasksQuery,
  ): Promise<{ items: Task[]; nextCursor?: string }> {
    if (query.noteId) {
      return this.listByNote(userId, query.noteId, query);
    }

    const today = query.today ?? utcToday();
    const areas = query.area ? [query.area] : ALL_AREAS;
    const statuses = query.status
      ? [query.status]
      : query.open
        ? OPEN_TASK_STATUSES
        : ALL_STATUSES;
    const ranges = scheduleRanges(query);
    const partitions = areas.flatMap((area) =>
      statuses.flatMap((status) =>
        ranges.map((range) => ({ area, status, range })),
      ),
    );

    if (partitions.length === 1) {
      const { area, status, range } = partitions[0]!;
      const page = await this.listPartition(userId, area, status, range, query);
      return {
        items: sortTasksForList(page.items, today),
        nextCursor: page.nextCursor,
      };
    }

    const page = await walkPartitions(
      partitions,
      query.cursor,
      query.limit ?? 50,
      ({ area, status, range }, cursor, remaining, remainingBytes) =>
        this.listPartition(
          userId,
          area,
          status,
          range,
          { ...query, cursor, limit: remaining },
          remainingBytes,
        ),
    );
    return {
      items: sortTasksForList(page.items, today),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  /**
   * Open tasks a new daily note for `day` carries in: everything still open
   * from earlier days. Tasks scheduled for `day` itself stay in Still open.
   */
  async carriedInto(
    userId: string,
    area: NotebookArea,
    day: string,
    max = CARRY_IN_MAX,
  ): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.list(userId, {
        area,
        open: true,
        startOnOrBefore: day,
        today: day,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      for (const task of page.items) {
        if (task.startDate !== day) ids.push(task.id);
      }
      cursor = page.nextCursor;
    } while (cursor && ids.length < max);
    return ids.slice(0, max);
  }

  private async listByNote(
    userId: string,
    noteId: string,
    query: ListTasksQuery,
  ): Promise<{ items: Task[]; nextCursor?: string }> {
    const pk = keys.notebook.noteTasksGsi2(userId, noteId);
    const page = await this.base.queryPage({
      IndexName: GSI2_NAME,
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ScanIndexForward: true,
      cursor: query.cursor,
      limit: query.limit,
      cursorPartition: { attr: 'gsi2pk', value: pk },
      byteBudget: PAGE_BYTE_BUDGET,
    });
    const items = page.items.filter((t) => matchesListQuery(t, query));
    return {
      items: sortTasksForList(items, query.today ?? utcToday()),
      nextCursor: page.nextCursor,
    };
  }

  private async listPartition(
    userId: string,
    area: NotebookArea,
    status: TaskStatus,
    range: SortKeyRange | undefined,
    query: ListTasksQuery,
    byteBudget = PAGE_BYTE_BUDGET,
  ): Promise<{ items: Task[]; nextCursor?: string }> {
    const pk = keys.notebook.taskAreaStatusGsi1(userId, area, status);
    const page = await this.base.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: range
        ? 'gsi1pk = :pk AND gsi1sk BETWEEN :from AND :to'
        : 'gsi1pk = :pk',
      ExpressionAttributeValues: range
        ? { ':pk': pk, ':from': range.from, ':to': range.to }
        : { ':pk': pk },
      ScanIndexForward: true,
      cursor: query.cursor,
      limit: query.limit,
      cursorPartition: { attr: 'gsi1pk', value: pk },
      byteBudget,
      ...(range
        ? {
            cursorSortBound: {
              attr: 'gsi1sk',
              lowerBoundInclusive: range.from,
            },
          }
        : {}),
    });
    // Key ranges narrow the read; this keeps every filter exact, including
    // the ones (priority, due dates) that have no key condition.
    return {
      items: page.items.filter((t) => matchesListQuery(t, query)),
      nextCursor: page.nextCursor,
    };
  }
}

let defaultTasksRepo: TasksRepository | undefined;

export function tasksRepository(): TasksRepository {
  defaultTasksRepo ??= new TasksRepository();
  return defaultTasksRepo;
}

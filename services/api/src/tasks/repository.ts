/**
 * Owner-scoped Notebook tasks (CHR-43).
 * Uses OwnerScopedVersionedEntityRepository + CHR-39 mappers/keys.
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
  type TaskMetaItem,
} from '@gagnechris/data';
import {
  TaskSyncChangeSchema,
  type CreateTaskRequest,
  type ListTasksQuery,
  type NotebookArea,
  type SyncChange,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskSyncChange,
  type UpdateTaskRequest,
} from '@gagnechris/shared';
import {
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
  PRIMARY_CURSOR_KEYS,
} from '../data/cursor.js';
import { getDocClient, requireTableName } from '../data/client.js';
import { OwnerScopedVersionedEntityRepository } from '../data/owner-scoped-versioned-entity-repository.js';
import { registerSyncEntity } from '../sync/registry.js';

export const TASK_CHANGE_TYPE = 'task';

const ALL_AREAS: NotebookArea[] = ['work', 'personal'];
const ALL_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];
const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  med: 1,
  low: 2,
};

/** UTC calendar day `yyyy-mm-dd` for overdue comparisons. */
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
    | 'noteId'
    | 'tags'
  >,
): string {
  return [
    t.userId,
    t.area,
    t.title,
    t.description,
    t.priority,
    t.status,
    t.dueDate ?? '',
    t.noteId ?? '',
    t.tags.join(','),
  ].join('\0');
}

export function taskToChange(
  item: Record<string, unknown>,
): SyncChange | undefined {
  if (item.entityType !== TASK_CHANGE_TYPE) return undefined;
  let entity: Task;
  try {
    entity = metaToTask(parseTaskMetaItem(item));
  } catch {
    return undefined;
  }
  const change: TaskSyncChange = TaskSyncChangeSchema.parse({
    type: TASK_CHANGE_TYPE,
    id: entity.id,
    version: entity.version,
    deleted: entity.deleted,
    updatedAt: entity.updatedAt,
    ...(entity.deleted ? {} : { entity }),
  });
  return change;
}

registerSyncEntity({
  changeType: TASK_CHANGE_TYPE,
  toChange: taskToChange,
});

export function sortTasksForList(items: Task[], today: string): Task[] {
  return [...items].sort((a, b) => {
    const aOverdue = a.dueDate !== null && a.dueDate < today ? 0 : 1;
    const bOverdue = b.dueDate !== null && b.dueDate < today ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    if (a.dueDate === null && b.dueDate !== null) return 1;
    if (a.dueDate !== null && b.dueDate === null) return -1;
    if (a.dueDate !== null && b.dueDate !== null && a.dueDate !== b.dueDate) {
      return a.dueDate < b.dueDate ? -1 : 1;
    }

    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
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

export class TasksRepository {
  private readonly base: OwnerScopedVersionedEntityRepository<
    Task,
    TaskMetaItem
  >;

  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {
    this.base = new OwnerScopedVersionedEntityRepository<Task, TaskMetaItem>(
      {
        conflictLabel: 'task',
        keyForId: (userId, id) => keys.notebook.task.meta(userId, id),
        idOf: (t) => t.id,
        userIdOf: (t) => t.userId,
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
          toChange: taskToChange,
        },
      },
      doc,
      tableName,
    );
  }

  get(userId: string, id: string): Promise<Task | undefined> {
    return this.base.get(userId, id);
  }

  getOrThrow(userId: string, id: string): Promise<Task> {
    return this.base.getOrThrow(userId, id);
  }

  createIdempotent(task: Task): Promise<Task> {
    return this.base.createIdempotent(task);
  }

  updateIfVersion(
    userId: string,
    id: string,
    expectedVersion: number,
    next: Task,
  ): Promise<Task> {
    return this.base.updateIfVersion(userId, id, expectedVersion, next);
  }

  softDelete(
    userId: string,
    id: string,
    expectedVersion: number,
    tombstone: Task,
  ): Promise<Task> {
    return this.base.softDelete(userId, id, expectedVersion, tombstone);
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

  async updateFromRequest(
    userId: string,
    id: string,
    expectedVersion: number,
    body: UpdateTaskRequest,
    existing: Task,
  ): Promise<Task> {
    const now = this.nowIso();
    const status = body.status ?? existing.status;
    const next: Task = {
      ...existing,
      area: body.area ?? existing.area,
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      priority: body.priority ?? existing.priority,
      status,
      dueDate: body.dueDate !== undefined ? body.dueDate : existing.dueDate,
      noteId: body.noteId !== undefined ? body.noteId : existing.noteId,
      tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
      completedAt: withCompletedAt(status, existing.completedAt, now),
      version: existing.version + 1,
      updatedAt: now,
    };
    return this.updateIfVersion(userId, id, expectedVersion, next);
  }

  async complete(
    userId: string,
    id: string,
    expectedVersion: number,
    existing: Task,
  ): Promise<Task> {
    const now = this.nowIso();
    const next: Task = {
      ...existing,
      status: 'done',
      completedAt: existing.completedAt ?? now,
      version: existing.version + 1,
      updatedAt: now,
    };
    return this.updateIfVersion(userId, id, expectedVersion, next);
  }

  async reopen(
    userId: string,
    id: string,
    expectedVersion: number,
    existing: Task,
  ): Promise<Task> {
    const now = this.nowIso();
    const next: Task = {
      ...existing,
      status: 'todo',
      completedAt: null,
      version: existing.version + 1,
      updatedAt: now,
    };
    return this.updateIfVersion(userId, id, expectedVersion, next);
  }

  async list(
    userId: string,
    query: ListTasksQuery,
  ): Promise<{ items: Task[]; nextCursor?: string }> {
    if (query.noteId) {
      return this.listByNote(userId, query.noteId, query);
    }

    const areas = query.area ? [query.area] : ALL_AREAS;
    const statuses = query.status ? [query.status] : ALL_STATUSES;
    const singlePartition = areas.length === 1 && statuses.length === 1;

    if (singlePartition) {
      const page = await this.listPartition(
        userId,
        areas[0]!,
        statuses[0]!,
        query,
      );
      return {
        items: sortTasksForList(page.items, utcToday()),
        nextCursor: page.nextCursor,
      };
    }

    const pages = await Promise.all(
      areas.flatMap((area) =>
        statuses.map((status) =>
          this.listPartition(userId, area, status, {
            ...query,
            cursor: undefined,
          }),
        ),
      ),
    );
    let merged = pages.flatMap((p) => p.items);
    if (query.priority) {
      merged = merged.filter((t) => t.priority === query.priority);
    }
    const sorted = sortTasksForList(merged, utcToday());
    const limit = query.limit ?? 50;
    return { items: sorted.slice(0, limit) };
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
    });
    let items = page.items;
    if (query.area) items = items.filter((t) => t.area === query.area);
    if (query.status) items = items.filter((t) => t.status === query.status);
    if (query.priority) {
      items = items.filter((t) => t.priority === query.priority);
    }
    if (query.dueOn) {
      items = items.filter((t) => t.dueDate === query.dueOn);
    }
    if (query.dueBefore) {
      items = items.filter(
        (t) => t.dueDate !== null && t.dueDate < query.dueBefore!,
      );
    }
    return {
      items: sortTasksForList(items, utcToday()),
      nextCursor: page.nextCursor,
    };
  }

  private async listPartition(
    userId: string,
    area: NotebookArea,
    status: TaskStatus,
    query: ListTasksQuery,
  ): Promise<{ items: Task[]; nextCursor?: string }> {
    const pk = keys.notebook.taskAreaStatusGsi1(userId, area, status);
    const values: Record<string, string> = { ':pk': pk };
    let keyCondition = 'gsi1pk = :pk';
    let sortLower: string | undefined;

    if (query.dueOn) {
      values[':from'] = `DUE#${query.dueOn}`;
      values[':to'] = `DUE#${query.dueOn}#TASK~\uffff`;
      keyCondition += ' AND gsi1sk BETWEEN :from AND :to';
      sortLower = values[':from'];
    } else if (query.dueBefore) {
      // Strictly before dueBefore, DUE# prefix only (excludes UPDATED# undated).
      values[':from'] = 'DUE#';
      values[':to'] = `DUE#${query.dueBefore}`;
      keyCondition += ' AND gsi1sk BETWEEN :from AND :to';
      sortLower = 'DUE#';
    }

    const page = await this.base.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ScanIndexForward: true,
      cursor: query.cursor,
      limit: query.limit,
      cursorPartition: { attr: 'gsi1pk', value: pk },
      ...(sortLower
        ? {
            cursorSortBound: { attr: 'gsi1sk', lowerBoundInclusive: sortLower },
          }
        : {}),
    });

    let items = page.items;
    // dueBefore BETWEEN upper bound is inclusive of `DUE#<date>` prefix alone;
    // filter out any sk that is not strictly before the date.
    if (query.dueBefore) {
      items = items.filter(
        (t) => t.dueDate !== null && t.dueDate < query.dueBefore!,
      );
    }
    if (query.priority) {
      items = items.filter((t) => t.priority === query.priority);
    }
    return { items, nextCursor: page.nextCursor };
  }
}

let defaultTasksRepo: TasksRepository | undefined;

export function tasksRepository(): TasksRepository {
  defaultTasksRepo ??= new TasksRepository();
  return defaultTasksRepo;
}

export function createTasksRepository(
  doc: DynamoDBDocumentClient,
  tableName: string,
  nowIso?: () => string,
): TasksRepository {
  return new TasksRepository(doc, tableName, nowIso);
}

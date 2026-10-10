/**
 * Uses VersionedRepository (owner-scoped) with @gagnechris/data mappers/keys.
 */
import {
  DeleteCommand,
  GetCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  GSI1_NAME,
  noteGsi1SkRanges,
  notebookAreaGsi1Pk,
  buildDailyNoteClaimItem,
  buildNoteMetaItem,
  deepEqual,
  dynamoErrorName,
  keys,
  metaToNote,
  normalizeTags,
  parseNoteMetaItem,
  type NoteMetaItem,
} from '@gagnechris/data';
import {
  NOTEBOOK_PAGE_SIZE,
  NoteSyncChangeSchema,
  taskEmbedIds,
  type CreateNoteRequest,
  type ListNotesQuery,
  type Note,
  type NotebookArea,
  type UpdateNoteRequest,
} from '@gagnechris/shared';
import { batchGetOwned } from '../data/batch-get-owned.js';
import { GSI1_CURSOR_KEYS, PRIMARY_CURSOR_KEYS } from '../data/cursor.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../data/errors.js';
import { PAGE_BYTE_BUDGET } from '../data/page-budget.js';
import { walkPartitions } from '../data/partition-walk.js';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import {
  VersionedRepository,
  ownerScoped,
  type OwnerKey,
  type UniqueClaimHook,
} from '../data/versioned-repository.js';
import { hashCreateFields } from '../data/create-hash.js';
import { toSyncChange } from '../sync/to-sync-change.js';

export const NOTE_CHANGE_TYPE = 'note';

export type EmptyDailyNote = {
  exists: false;
  userId: string;
  area: NotebookArea;
  type: 'daily';
  date: string;
  title: '';
  bodyMarkdown: '';
  tags: [];
  pinned: false;
  version: 0;
};

export type DailyNoteResult = Note | EmptyDailyNote;

type DailyNoteFields = {
  id: string;
  title?: string;
  bodyMarkdown?: string;
  tags?: string[];
  pinned?: boolean;
};

export function isEmptyDaily(
  result: DailyNoteResult,
): result is EmptyDailyNote {
  return 'exists' in result && result.exists === false;
}

export function noteCreatePayloadHash(
  n: Pick<
    Note,
    | 'userId'
    | 'area'
    | 'type'
    | 'date'
    | 'title'
    | 'bodyMarkdown'
    | 'tags'
    | 'pinned'
  >,
): string {
  return hashCreateFields([
    n.userId,
    n.area,
    n.type,
    n.date ?? '',
    n.title,
    n.bodyMarkdown,
    n.tags.join(','),
    n.pinned ? '1' : '0',
  ]);
}

export const noteToChange = toSyncChange(
  NOTE_CHANGE_TYPE,
  (item) => metaToNote(parseNoteMetaItem(item)),
  NoteSyncChangeSchema,
);

async function readDailyHolder(
  doc: DynamoDBDocumentClient,
  tableName: string,
  entity: Note,
): Promise<
  | {
      claimKey: { pk: string; sk: string };
      noteId: string;
      meta?: Record<string, unknown>;
    }
  | undefined
> {
  if (entity.type !== 'daily' || !entity.date) return undefined;
  const claimKey = keys.notebook.dailyClaim(
    entity.userId,
    entity.area,
    entity.date,
  );
  const claim = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: claimKey,
      ConsistentRead: true,
    }),
  );
  const noteId =
    typeof claim.Item?.noteId === 'string' ? claim.Item.noteId : undefined;
  if (!noteId) return undefined;
  const meta = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.notebook.note.meta(entity.userId, noteId),
      ConsistentRead: true,
    }),
  );
  return { claimKey, noteId, meta: meta.Item };
}

function dailyNoteClaimHook(
  doc: DynamoDBDocumentClient,
  tableName: string,
): UniqueClaimHook<Note> {
  return {
    buildItems: (entity) => {
      if (entity.type !== 'daily' || !entity.date) return [];
      const claim = buildDailyNoteClaimItem(
        entity.userId,
        entity.area,
        entity.date,
        entity.id,
      );
      return [
        {
          Put: {
            Item: claim,
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ];
    },
    claimIndexes: [0],
    conflictCode: 'daily_taken',
    conflictMessage: 'Daily note already exists for this area and date',
    resolveConflict: async (entity) => {
      const holder = await readDailyHolder(doc, tableName, entity);
      return holder?.meta
        ? metaToNote(parseNoteMetaItem(holder.meta))
        : undefined;
    },
    releaseItems: (entity) => {
      if (entity.type !== 'daily' || !entity.date) return [];
      return [
        {
          Delete: {
            Key: keys.notebook.dailyClaim(
              entity.userId,
              entity.area,
              entity.date,
            ),
            // Only free the claim if it is still this note's.
            ConditionExpression: 'attribute_not_exists(pk) OR noteId = :id',
            ExpressionAttributeValues: { ':id': entity.id },
          },
        },
      ];
    },
    releaseStale: async (holder) => {
      if (holder.type !== 'daily' || !holder.date) return;
      try {
        await doc.send(
          new DeleteCommand({
            TableName: tableName,
            Key: keys.notebook.dailyClaim(
              holder.userId,
              holder.area,
              holder.date,
            ),
            ConditionExpression: 'noteId = :id',
            ExpressionAttributeValues: { ':id': holder.id },
          }),
        );
      } catch (error) {
        // Someone else already freed or re-took it; the retry sorts it out.
        if (!isConditionalCheckFailed(error)) throw error;
      }
    },
    // Left by deletes that never released the claim once the tombstone is
    // TTL-purged, or by a partial restore.
    releaseOrphan: async (entity) => {
      const holder = await readDailyHolder(doc, tableName, entity);
      // Already freed, or re-taken by a racer; the retry sorts it out.
      if (!holder || holder.meta) return;
      try {
        await doc.send(
          new DeleteCommand({
            TableName: tableName,
            Key: holder.claimKey,
            ConditionExpression: 'noteId = :id',
            ExpressionAttributeValues: { ':id': holder.noteId },
          }),
        );
      } catch (error) {
        if (!isConditionalCheckFailed(error)) throw error;
      }
    },
  };
}

type NoteUpdateFields = Omit<UpdateNoteRequest, 'version'>;

function applyNoteUpdate(
  existing: Note,
  body: NoteUpdateFields,
  now: string,
): Note {
  // The (area, date) claim is what makes a daily note unique; moving it
  // to another area would leave two dailies for one day.
  if (
    existing.type === 'daily' &&
    body.area !== undefined &&
    body.area !== existing.area
  ) {
    throw new BadRequestError("A daily note's area cannot change", {
      area: 'immutable',
    });
  }
  const bodyMarkdown = body.bodyMarkdown ?? existing.bodyMarkdown;
  return {
    ...existing,
    title: body.title ?? existing.title,
    bodyMarkdown,
    taskIds: taskEmbedIds(bodyMarkdown),
    tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
    pinned: body.pinned ?? existing.pinned,
    area: body.area ?? existing.area,
    updatedAt: now,
  };
}

/** A retried create of the same daily note (same id and content) is a no-op. */
function noteMatchesDailyCreate(note: Note, body: DailyNoteFields): boolean {
  return (
    note.id === body.id &&
    note.version === 1 &&
    (body.title ?? '') === note.title &&
    (body.bodyMarkdown ?? '') === note.bodyMarkdown &&
    (body.pinned ?? false) === note.pinned &&
    deepEqual(normalizeTags(body.tags ?? []), note.tags)
  );
}

class NotThisDaysNote extends Error {}

function isConditionalCheckFailed(error: unknown): boolean {
  return dynamoErrorName(error) === 'ConditionalCheckFailedException';
}

export class NotesRepository {
  private readonly base: VersionedRepository<Note, NoteMetaItem, OwnerKey>;

  constructor(
    readonly doc: DynamoDBDocumentClient = getDocClient(),
    readonly tableName: string = requireTableName(),
    private readonly nowIso: Clock = systemClock,
  ) {
    this.base = new VersionedRepository<Note, NoteMetaItem, OwnerKey>(
      {
        conflictLabel: 'note',
        scope: ownerScoped({
          keyForId: (userId, id) => keys.notebook.note.meta(userId, id),
          idOf: (n) => n.id,
          userIdOf: (n) => n.userId,
        }),
        toEntity: (item) => metaToNote(parseNoteMetaItem(item)),
        toItem: buildNoteMetaItem,
        isDeleted: (n) => n.deleted,
        nowIso: this.nowIso,
        cursorKeyNames: PRIMARY_CURSOR_KEYS,
        cursorKeysByIndex: {
          [GSI1_NAME]: GSI1_CURSOR_KEYS,
        },
        sync: {
          changeType: NOTE_CHANGE_TYPE,
          userIdOf: (n) => n.userId,
          createPayloadHash: noteCreatePayloadHash,
        },
        uniqueClaim: dailyNoteClaimHook(doc, tableName),
      },
      doc,
      tableName,
    );
  }

  get(userId: string, id: string): Promise<Note | undefined> {
    return this.base.get({ userId, id });
  }

  getOrThrow(userId: string, id: string): Promise<Note> {
    return this.base.getOrThrow({ userId, id });
  }

  /** Live notes among `ids` in their order, in one BatchGetItem. */
  getMany(userId: string, ids: readonly string[]): Promise<Note[]> {
    return batchGetOwned(
      this.doc,
      this.tableName,
      userId,
      ids,
      keys.notebook.note.meta,
      (raw) => this.base.mapItem(raw),
    );
  }

  createIdempotent(note: Note): Promise<Note> {
    return this.base.createIdempotent(note);
  }

  deleteIfVersion(
    userId: string,
    id: string,
    expected: number | 'any',
  ): Promise<Note> {
    return this.base.softDeleteIfVersion(
      { userId, id },
      expected,
      (n, now) => ({
        ...n,
        updatedAt: now,
        deleted: true,
      }),
    );
  }

  async createFromRequest(
    userId: string,
    body: CreateNoteRequest,
  ): Promise<Note> {
    const now = this.nowIso();
    const note: Note = {
      id: body.id,
      userId,
      area: body.area,
      type: body.type,
      date: body.type === 'daily' ? (body.date ?? null) : null,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown,
      tags: normalizeTags(body.tags),
      pinned: body.pinned,
      taskIds: taskEmbedIds(body.bodyMarkdown),
      version: 1,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    return this.createIdempotent(note);
  }

  async updateFromRequest(
    userId: string,
    id: string,
    expected: number | 'any',
    body: NoteUpdateFields,
  ): Promise<Note> {
    return this.base.mutateIfVersion(
      { userId, id },
      expected,
      (existing, now) => applyNoteUpdate(existing, body, now),
    );
  }

  async list(
    userId: string,
    query: ListNotesQuery,
  ): Promise<{ items: Note[]; nextCursor?: string }> {
    const areas: NotebookArea[] = query.area
      ? [query.area]
      : ['work', 'personal'];

    if (areas.length === 1) {
      return this.listArea(userId, areas[0]!, query);
    }

    return walkPartitions(
      areas,
      query.cursor,
      query.limit ?? NOTEBOOK_PAGE_SIZE,
      (area, cursor, remaining, remainingBytes) =>
        this.listArea(
          userId,
          area,
          { ...query, cursor, limit: remaining },
          remainingBytes,
        ),
    );
  }

  private async listArea(
    userId: string,
    area: NotebookArea,
    query: ListNotesQuery,
    byteBudget = PAGE_BYTE_BUDGET,
  ): Promise<{ items: Note[]; nextCursor?: string }> {
    const pk = notebookAreaGsi1Pk(userId, area);
    const range =
      query.from || query.to
        ? noteGsi1SkRanges.dates(query.from, query.to)
        : query.type === 'daily'
          ? noteGsi1SkRanges.daily()
          : query.type === 'page'
            ? noteGsi1SkRanges.pages()
            : undefined;

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
      limit: query.limit ?? NOTEBOOK_PAGE_SIZE,
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

    // Only daily notes have DATE# keys, so a date range needs no type filter.
    return { items: page.items, nextCursor: page.nextCursor };
  }

  async getDaily(
    userId: string,
    area: NotebookArea,
    date: string,
  ): Promise<DailyNoteResult> {
    const claim = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.notebook.dailyClaim(userId, area, date),
        ConsistentRead: true,
      }),
    );
    const noteId =
      typeof claim.Item?.noteId === 'string' ? claim.Item.noteId : undefined;
    const held = noteId
      ? await this.base.getIncludingDeleted(
          { userId, id: noteId },
          {
            consistentRead: true,
          },
        )
      : undefined;
    if (!held || held.deleted) {
      return {
        exists: false,
        userId,
        area,
        type: 'daily',
        date,
        title: '',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
        version: 0,
      };
    }
    return held;
  }

  /**
   * One consistent read (the note named by `body.id`) before the write. Only
   * when that id is not this day's note does the claim decide which note to
   * update, or whether to create one.
   */
  async updateDaily(
    userId: string,
    area: NotebookArea,
    date: string,
    body: DailyNoteFields,
    expected: number | 'any',
  ): Promise<Note> {
    const fields = {
      title: body.title,
      bodyMarkdown: body.bodyMarkdown,
      tags: body.tags,
      pinned: body.pinned,
    };
    try {
      return await this.base.mutateIfVersion(
        { userId, id: body.id },
        expected,
        (existing, now) => {
          if (
            existing.type !== 'daily' ||
            existing.area !== area ||
            existing.date !== date
          ) {
            throw new NotThisDaysNote();
          }
          return applyNoteUpdate(existing, fields, now);
        },
      );
    } catch (error) {
      if (!(error instanceof NotFoundError || error instanceof NotThisDaysNote))
        throw error;
    }
    const current = await this.getDaily(userId, area, date);
    if (isEmptyDaily(current))
      return this.createDaily(userId, area, date, body);
    return this.updateFromRequest(userId, current.id, expected, fields);
  }

  /**
   * A write with no version can only create the day's note. A retry of the
   * same create is a no-op; anything else is 409 with the current note, so a
   * writer still holding the empty placeholder merges instead of overwriting.
   */
  async createDailyOrReplay(
    userId: string,
    area: NotebookArea,
    date: string,
    body: DailyNoteFields,
  ): Promise<Note> {
    let note: Note;
    try {
      note = await this.createDaily(userId, area, date, body);
    } catch (error) {
      if (
        error instanceof ConflictError &&
        error.code === 'payload_mismatch' &&
        error.current
      ) {
        throw this.changedSinceCreate(error.current as Note);
      }
      throw error;
    }
    if (!noteMatchesDailyCreate(note, body))
      throw this.changedSinceCreate(note);
    return note;
  }

  private changedSinceCreate(current: Note): ConflictError {
    return new ConflictError('Daily note changed since it was created', {
      code: 'version_conflict',
      currentVersion: current.version,
      current,
    });
  }

  /** A loser of the day's claim gets 409 `daily_taken` with the winner. */
  createDaily(
    userId: string,
    area: NotebookArea,
    date: string,
    body: DailyNoteFields,
  ): Promise<Note> {
    return this.createFromRequest(userId, {
      id: body.id,
      area,
      type: 'daily',
      date,
      title: body.title ?? '',
      bodyMarkdown: body.bodyMarkdown ?? '',
      tags: body.tags ?? [],
      pinned: body.pinned ?? false,
    });
  }
}

let defaultNotesRepo: NotesRepository | undefined;

export function notesRepository(): NotesRepository {
  defaultNotesRepo ??= new NotesRepository();
  return defaultNotesRepo;
}

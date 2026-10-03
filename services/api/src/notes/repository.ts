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
  buildDailyNoteClaimItem,
  buildNoteMetaItem,
  keys,
  metaToNote,
  normalizeTags,
  parseNoteMetaItem,
  type NoteMetaItem,
} from '@gagnechris/data';
import {
  NoteSyncChangeSchema,
  type CreateNoteRequest,
  type ListNotesQuery,
  type Note,
  type NotebookArea,
  type NoteSyncChange,
  type SyncChange,
  type UpdateNoteRequest,
} from '@gagnechris/shared';
import { GSI1_CURSOR_KEYS, PRIMARY_CURSOR_KEYS } from '../data/cursor.js';
import { BadRequestError } from '../data/errors.js';
import { walkPartitions } from '../data/partition-walk.js';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  VersionedRepository,
  ownerScoped,
  type OwnerKey,
  type UniqueClaimHook,
} from '../data/versioned-repository.js';
import { hashCreateFields } from '../data/create-hash.js';

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

function isEmptyDaily(result: DailyNoteResult): result is EmptyDailyNote {
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

export function noteToChange(
  item: Record<string, unknown>,
): SyncChange | undefined {
  if (item.entityType !== NOTE_CHANGE_TYPE) return undefined;
  let entity: Note;
  try {
    entity = metaToNote(parseNoteMetaItem(item));
  } catch {
    return undefined;
  }
  const change: NoteSyncChange = NoteSyncChangeSchema.parse({
    type: NOTE_CHANGE_TYPE,
    id: entity.id,
    version: entity.version,
    deleted: entity.deleted,
    updatedAt: entity.updatedAt,
    ...(entity.deleted ? {} : { entity }),
  });
  return change;
}

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

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ConditionalCheckFailedException'
  );
}

export class NotesRepository {
  private readonly base: VersionedRepository<Note, NoteMetaItem, OwnerKey>;

  private readonly nowIso: () => string;

  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
    nowIso?: () => string,
  ) {
    this.nowIso = nowIso ?? (() => new Date().toISOString());
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
        nowIso,
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
    body: Omit<UpdateNoteRequest, 'version'>,
  ): Promise<Note> {
    return this.base.mutateIfVersion(
      { userId, id },
      expected,
      (existing, now) => {
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
        return {
          ...existing,
          title: body.title ?? existing.title,
          bodyMarkdown: body.bodyMarkdown ?? existing.bodyMarkdown,
          tags:
            body.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
          pinned: body.pinned ?? existing.pinned,
          area: body.area ?? existing.area,
          updatedAt: now,
        };
      },
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
      query.limit ?? 50,
      (area, cursor, remaining) =>
        this.listArea(userId, area, { ...query, cursor, limit: remaining }),
    );
  }

  private async listArea(
    userId: string,
    area: NotebookArea,
    query: ListNotesQuery,
  ): Promise<{ items: Note[]; nextCursor?: string }> {
    const pk = keys.notebook.areaGsi1(userId, area);
    const values: Record<string, string> = { ':pk': pk };
    let keyCondition = 'gsi1pk = :pk';
    let sortLower: string | undefined;

    if (query.from || query.to) {
      const from = query.from ?? '0000-01-01';
      const to = query.to ?? '9999-12-31';
      values[':from'] = `DATE#${from}`;
      values[':to'] = `DATE#${to}#NOTE~\uffff`;
      keyCondition += ' AND gsi1sk BETWEEN :from AND :to';
      sortLower = values[':from'];
    } else if (query.type === 'daily') {
      values[':prefix'] = 'DATE#';
      keyCondition += ' AND begins_with(gsi1sk, :prefix)';
      sortLower = 'DATE#';
    } else if (query.type === 'page') {
      values[':prefix'] = 'PAGE#';
      keyCondition += ' AND begins_with(gsi1sk, :prefix)';
      sortLower = 'PAGE#';
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
    if (query.type && !(query.from || query.to)) {
      // Already constrained by begins_with when type set without date range.
    } else if (query.type) {
      items = items.filter((n) => n.type === query.type);
    }
    return { items, nextCursor: page.nextCursor };
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

  /** Updates only with a caller-supplied version; otherwise the claim decides. */
  async upsertDaily(
    userId: string,
    area: NotebookArea,
    date: string,
    body: DailyNoteFields,
    expectedVersion: number | 'any',
  ): Promise<Note> {
    const existing = await this.getDaily(userId, area, date);
    if (!isEmptyDaily(existing)) {
      return this.updateFromRequest(userId, existing.id, expectedVersion, {
        title: body.title,
        bodyMarkdown: body.bodyMarkdown,
        tags: body.tags,
        pinned: body.pinned,
      });
    }
    return this.createDaily(userId, area, date, body);
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

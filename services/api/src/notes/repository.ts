/**
 * Owner-scoped Notebook notes (CHR-40).
 * Uses OwnerScopedVersionedEntityRepository + CHR-39 mappers/keys.
 */
import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
import { getDocClient, requireTableName } from '../data/client.js';
import {
  OwnerScopedVersionedEntityRepository,
  type UniqueClaimHook,
} from '../data/owner-scoped-versioned-entity-repository.js';
import { registerSyncEntity } from '../sync/registry.js';

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
  return [
    n.userId,
    n.area,
    n.type,
    n.date ?? '',
    n.title,
    n.bodyMarkdown,
    n.tags.join(','),
    n.pinned ? '1' : '0',
  ].join('\0');
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

/** Ensure sync feed can decode notes even before the first repository construct. */
registerSyncEntity({
  changeType: NOTE_CHANGE_TYPE,
  toChange: noteToChange,
});

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
      if (entity.type !== 'daily' || !entity.date) return undefined;
      const claim = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: keys.notebook.dailyClaim(
            entity.userId,
            entity.area,
            entity.date,
          ),
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
      if (!meta.Item) return undefined;
      return metaToNote(parseNoteMetaItem(meta.Item));
    },
  };
}

export class NotesRepository {
  private readonly base: OwnerScopedVersionedEntityRepository<
    Note,
    NoteMetaItem
  >;

  private readonly nowIso: () => string;

  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
    nowIso?: () => string,
  ) {
    this.nowIso = nowIso ?? (() => new Date().toISOString());
    this.base = new OwnerScopedVersionedEntityRepository<Note, NoteMetaItem>(
      {
        conflictLabel: 'note',
        keyForId: (userId, id) => keys.notebook.note.meta(userId, id),
        idOf: (n) => n.id,
        userIdOf: (n) => n.userId,
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
          toChange: noteToChange,
        },
        uniqueClaim: dailyNoteClaimHook(doc, tableName),
      },
      doc,
      tableName,
    );
  }

  get(userId: string, id: string): Promise<Note | undefined> {
    return this.base.get(userId, id);
  }

  getOrThrow(userId: string, id: string): Promise<Note> {
    return this.base.getOrThrow(userId, id);
  }

  createIdempotent(note: Note): Promise<Note> {
    return this.base.createIdempotent(note);
  }

  updateIfVersion(
    userId: string,
    id: string,
    expectedVersion: number,
    next: Note,
  ): Promise<Note> {
    return this.base.updateIfVersion(userId, id, expectedVersion, next);
  }

  softDelete(
    userId: string,
    id: string,
    expectedVersion: number,
    tombstone: Note,
  ): Promise<Note> {
    return this.base.softDelete(userId, id, expectedVersion, tombstone);
  }

  /** Tombstone built from a consistent read (CHR-188). */
  deleteIfVersion(
    userId: string,
    id: string,
    expected: number | 'any',
  ): Promise<Note> {
    return this.base.softDeleteIfVersion(userId, id, expected, (n, now) => ({
      ...n,
      updatedAt: now,
      deleted: true,
    }));
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

  /**
   * Apply only the fields in `body` to a consistent read (CHR-188), so a
   * stale replica can never revert content or reuse a version.
   */
  async updateFromRequest(
    userId: string,
    id: string,
    expected: number | 'any',
    body: Omit<UpdateNoteRequest, 'version'>,
  ): Promise<Note> {
    return this.base.mutateIfVersion(userId, id, expected, (existing, now) => ({
      ...existing,
      title: body.title ?? existing.title,
      bodyMarkdown: body.bodyMarkdown ?? existing.bodyMarkdown,
      tags: body.tags !== undefined ? normalizeTags(body.tags) : existing.tags,
      pinned: body.pinned ?? existing.pinned,
      area: body.area ?? existing.area,
      updatedAt: now,
    }));
  }

  async list(
    userId: string,
    query: ListNotesQuery,
  ): Promise<{ items: Note[]; nextCursor?: string }> {
    const areas: NotebookArea[] = query.area
      ? [query.area]
      : ['work', 'personal'];

    // Single-area path supports opaque cursors; multi-area merges one page each.
    if (areas.length === 1) {
      return this.listArea(userId, areas[0]!, query);
    }

    const pages = await Promise.all(
      areas.map((area) =>
        this.listArea(userId, area, { ...query, cursor: undefined }),
      ),
    );
    const merged = pages
      .flatMap((p) => p.items)
      .sort((a, b) => {
        const ak = `${a.date ?? a.updatedAt}#${a.id}`;
        const bk = `${b.date ?? b.updatedAt}#${b.id}`;
        return ak < bk ? -1 : ak > bk ? 1 : 0;
      });
    const limit = query.limit ?? 50;
    return { items: merged.slice(0, limit) };
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
    if (!noteId) {
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
    return this.getOrThrow(userId, noteId);
  }

  /**
   * Upsert today's (or any) daily note. Creates with claim when missing;
   * updates the claim winner when present.
   */
  async upsertDaily(
    userId: string,
    area: NotebookArea,
    date: string,
    body: {
      id: string;
      version?: number;
      title?: string;
      bodyMarkdown?: string;
      tags?: string[];
      pinned?: boolean;
    },
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

/** Default singleton so sync adapter registers on cold start. */
let defaultNotesRepo: NotesRepository | undefined;

export function notesRepository(): NotesRepository {
  defaultNotesRepo ??= new NotesRepository();
  return defaultNotesRepo;
}

/** Test helper — force a fresh repo against an injected client/table. */
export function createNotesRepository(
  doc: DynamoDBDocumentClient,
  tableName: string,
  nowIso?: () => string,
): NotesRepository {
  return new NotesRepository(doc, tableName, nowIso);
}

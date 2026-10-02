/**
 * Test-only synced entity used to prove owner-scoped repository + sync
 * config is enough to appear in the change feed (CHR-153 / CHR-162 / CHR-169).
 */
import {
  GSI1_NAME,
  GSI2_NAME,
  dailyNoteClaimPk,
  dailyNoteClaimSk,
  keys,
  noteDateGsi1Sk,
  notebookAreaGsi1Pk,
  noteTasksGsi2Pk,
  noteTasksGsi2Sk,
  type NotebookArea,
} from '@gagnechris/data';
import {
  FakeNoteEntitySchema,
  FakeNoteSyncChangeSchema,
  type SyncChange,
} from '@gagnechris/shared';
import {
  OwnerScopedVersionedEntityRepository,
  type UniqueClaimHook,
} from '../../src/data/owner-scoped-versioned-entity-repository.js';
import { type VersionedEntity } from '../../src/data/versioned-entity-repository.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { registerSyncEntity } from '../../src/sync/registry.js';
import {
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
  PRIMARY_CURSOR_KEYS,
} from '../../src/data/cursor.js';

export const FAKE_NOTE_CHANGE_TYPE = 'fakeNote';

export type FakeNote = VersionedEntity & {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  /** When set with `noteDate`, entity is a daily note (unique per area/date). */
  area?: NotebookArea;
  noteDate?: string;
};

export type FakeNoteItem = {
  pk: string;
  sk: string;
  entityType?: typeof FAKE_NOTE_CHANGE_TYPE;
  id: string;
  userId: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  area?: NotebookArea;
  noteDate?: string;
  createHash?: string;
  syncPk?: string;
  syncSk?: string;
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
  ttl?: number;
};

export function fakeNotePayloadHash(
  n: Pick<FakeNote, 'userId' | 'title' | 'body' | 'area' | 'noteDate'>,
): string {
  return [n.userId, n.title, n.body, n.area ?? '', n.noteDate ?? ''].join('\0');
}

export function toFakeNoteEntity(item: FakeNoteItem): FakeNote {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    body: item.body,
    version: item.version,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deleted: item.deleted,
    area: item.area,
    noteDate: item.noteDate,
  };
}

/**
 * Deliberately omits `entityType` — the base `toStoredItem` must stamp it from
 * sync.changeType so the feed still sees the row (CHR-162 AC).
 * Tombstones omit GSI1/GSI2 (stripped again in toStoredItem for safety).
 */
export function toFakeNoteItem(entity: FakeNote): FakeNoteItem {
  const { pk, sk } = keys.notebook.note.meta(entity.userId, entity.id);
  const item: FakeNoteItem = {
    pk,
    sk,
    id: entity.id,
    userId: entity.userId,
    title: entity.title,
    body: entity.body,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deleted: entity.deleted,
    area: entity.area,
    noteDate: entity.noteDate,
  };
  if (!entity.deleted && entity.area && entity.noteDate) {
    item.gsi1pk = notebookAreaGsi1Pk(entity.userId, entity.area);
    item.gsi1sk = noteDateGsi1Sk(entity.noteDate, entity.id);
    // Prove dual-index cursor support: GSI2 partitions by note id for "tasks
    // linked to note" access pattern (self-link for the fake entity).
    item.gsi2pk = noteTasksGsi2Pk(entity.userId, entity.id);
    item.gsi2sk = noteTasksGsi2Sk(entity.id);
  }
  return item;
}

export function fakeNoteToChange(
  item: Record<string, unknown>,
): SyncChange | undefined {
  if (item.entityType !== FAKE_NOTE_CHANGE_TYPE) return undefined;
  const parsed = FakeNoteEntitySchema.safeParse(
    toFakeNoteEntity(item as FakeNoteItem),
  );
  if (!parsed.success) return undefined;
  const entity = parsed.data;
  const change = FakeNoteSyncChangeSchema.parse({
    type: FAKE_NOTE_CHANGE_TYPE,
    id: entity.id,
    version: entity.version,
    deleted: entity.deleted,
    updatedAt: entity.updatedAt,
    ...(entity.deleted ? {} : { entity }),
  });
  return change;
}

/**
 * Ensures the fake-note adapter is registered (also happens via repo construct).
 * Kept for tests that call the ledger without constructing a repo first.
 */
export function registerFakeNoteSync(): void {
  registerSyncEntity({
    changeType: FAKE_NOTE_CHANGE_TYPE,
    toChange: fakeNoteToChange,
  });
}

function dailyNoteClaimHook(
  doc: NonNullable<
    ConstructorParameters<typeof OwnerScopedVersionedEntityRepository>[1]
  >,
  tableName: string,
): UniqueClaimHook<FakeNote> {
  return {
    buildItems: (entity) => {
      if (!entity.area || !entity.noteDate) return [];
      return [
        {
          Put: {
            Item: {
              pk: dailyNoteClaimPk(entity.userId, entity.area, entity.noteDate),
              sk: dailyNoteClaimSk(),
              entityType: 'dailyNoteClaim',
              noteId: entity.id,
              userId: entity.userId,
              area: entity.area,
              noteDate: entity.noteDate,
              createdAt: entity.updatedAt,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ];
    },
    claimIndexes: [0],
    conflictCode: 'daily_taken',
    conflictMessage: 'Daily note already exists for this area and date',
    /**
     * Two offline devices creating the same `(area, date)` with different
     * ULIDs: first writer wins; loser returns the existing note (CHR-169).
     */
    resolveConflict: async (entity) => {
      if (!entity.area || !entity.noteDate) return undefined;
      const claim = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            pk: dailyNoteClaimPk(entity.userId, entity.area, entity.noteDate),
            sk: dailyNoteClaimSk(),
          },
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
      return toFakeNoteEntity(meta.Item as FakeNoteItem);
    },
  };
}

export function createFakeNotesRepo(
  doc: NonNullable<
    ConstructorParameters<typeof OwnerScopedVersionedEntityRepository>[1]
  >,
  tableName: string,
  nowIso?: () => string,
): OwnerScopedVersionedEntityRepository<FakeNote, FakeNoteItem> {
  return new OwnerScopedVersionedEntityRepository<FakeNote, FakeNoteItem>(
    {
      conflictLabel: 'fake note',
      keyForId: (userId, id) => keys.notebook.note.meta(userId, id),
      idOf: (n) => n.id,
      userIdOf: (n) => n.userId,
      toEntity: toFakeNoteEntity,
      toItem: toFakeNoteItem,
      isDeleted: (n) => n.deleted,
      nowIso,
      cursorKeyNames: PRIMARY_CURSOR_KEYS,
      cursorKeysByIndex: {
        [GSI1_NAME]: GSI1_CURSOR_KEYS,
        [GSI2_NAME]: GSI2_CURSOR_KEYS,
      },
      sync: {
        changeType: FAKE_NOTE_CHANGE_TYPE,
        userIdOf: (n) => n.userId,
        createPayloadHash: fakeNotePayloadHash,
        toChange: fakeNoteToChange,
      },
      uniqueClaim: dailyNoteClaimHook(doc, tableName),
    },
    doc,
    tableName,
  );
}

export function buildFakeNote(
  userId: string,
  id: string,
  patch: Partial<FakeNote> & { title?: string; body?: string },
  now: string,
): FakeNote {
  return {
    id,
    userId,
    title: patch.title ?? '',
    body: patch.body ?? '',
    version: patch.version ?? 1,
    createdAt: patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now,
    deleted: patch.deleted ?? false,
    area: patch.area,
    noteDate: patch.noteDate,
  };
}

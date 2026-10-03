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
  NotebookAreaSchema,
  NoteSyncChangeSchema,
  SyncChangesResponseSchema,
  syncChangeSchemaFor,
  TaskSyncChangeSchema,
} from '@gagnechris/shared';
import { z } from 'zod';
import {
  VersionedRepository,
  ownerScoped,
  type OwnerKey,
  type UniqueClaimHook,
  type VersionedEntity,
} from '../../src/data/versioned-repository.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  registerSyncEntity,
  type SyncFeedChange,
} from '../../src/sync/registry.js';
import {
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
  PRIMARY_CURSOR_KEYS,
} from '../../src/data/cursor.js';
import { hashCreateFields } from '../../src/data/create-hash.js';

export const FAKE_NOTE_CHANGE_TYPE = 'fakeNote';

/** Fixture wire schema; deliberately outside the production `SyncChangeSchema`. */
export const FakeNoteEntitySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string(),
  body: z.string(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deleted: z.boolean(),
  area: NotebookAreaSchema.optional(),
  noteDate: z.string().optional(),
});

export const FakeNoteSyncChangeSchema = syncChangeSchemaFor(
  FAKE_NOTE_CHANGE_TYPE,
  FakeNoteEntitySchema,
);

export const TestSyncChangesResponseSchema = SyncChangesResponseSchema.extend({
  changes: z.array(
    z.discriminatedUnion('type', [
      FakeNoteSyncChangeSchema,
      NoteSyncChangeSchema,
      TaskSyncChangeSchema,
    ]),
  ),
});

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
  return hashCreateFields([
    n.userId,
    n.title,
    n.body,
    n.area ?? '',
    n.noteDate ?? '',
  ]);
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

/** Deliberately omits `entityType`: the base `toStoredItem` must stamp it so the feed still sees the row. */
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
): SyncFeedChange | undefined {
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

export function registerFakeNoteSync(): void {
  registerSyncEntity({
    changeType: FAKE_NOTE_CHANGE_TYPE,
    toChange: fakeNoteToChange,
  });
}

function dailyNoteClaimHook(
  doc: NonNullable<ConstructorParameters<typeof VersionedRepository>[1]>,
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
  doc: NonNullable<ConstructorParameters<typeof VersionedRepository>[1]>,
  tableName: string,
  nowIso?: () => string,
): VersionedRepository<FakeNote, FakeNoteItem, OwnerKey> {
  return new VersionedRepository<FakeNote, FakeNoteItem, OwnerKey>(
    {
      conflictLabel: 'fake note',
      scope: ownerScoped({
        keyForId: (userId, id) => keys.notebook.note.meta(userId, id),
        idOf: (n) => n.id,
        userIdOf: (n) => n.userId,
      }),
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

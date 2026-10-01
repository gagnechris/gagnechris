/**
 * Test-only synced entity used to prove VersionedEntityRepository.sync
 * config is enough to appear in the change feed (CHR-153 AC).
 */
import { keys } from '@gagnechris/data';
import type { SyncChange } from '@gagnechris/shared';
import {
  VersionedEntityRepository,
  type VersionedEntity,
} from '../../src/data/versioned-entity-repository.js';
import { registerSyncEntity } from '../../src/sync/registry.js';

export const FAKE_NOTE_CHANGE_TYPE = 'fakeNote';

export type FakeNote = VersionedEntity & {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export type FakeNoteItem = {
  pk: string;
  sk: string;
  entityType: typeof FAKE_NOTE_CHANGE_TYPE;
  id: string;
  userId: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  syncPk?: string;
  syncSk?: string;
  ttl?: number;
};

export function fakeNotePayloadHash(n: Pick<FakeNote, 'title' | 'body'>): string {
  return `${n.title}\0${n.body}`;
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
  };
}

export function toFakeNoteItem(entity: FakeNote): FakeNoteItem {
  const { pk, sk } = keys.fixture.meta(entity.id);
  return {
    pk,
    sk,
    entityType: FAKE_NOTE_CHANGE_TYPE,
    id: entity.id,
    userId: entity.userId,
    title: entity.title,
    body: entity.body,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deleted: entity.deleted,
  };
}

export function fakeNoteToChange(
  item: Record<string, unknown>,
): SyncChange | undefined {
  if (item.entityType !== FAKE_NOTE_CHANGE_TYPE) return undefined;
  const entity = toFakeNoteEntity(item as FakeNoteItem);
  const change: SyncChange = {
    type: FAKE_NOTE_CHANGE_TYPE,
    id: entity.id,
    version: entity.version,
    deleted: entity.deleted,
    updatedAt: entity.updatedAt,
  };
  if (!entity.deleted) {
    change.entity = { ...entity };
  }
  return change;
}

/** Register the fake-note adapter once for a test file. */
export function registerFakeNoteSync(): void {
  registerSyncEntity({
    changeType: FAKE_NOTE_CHANGE_TYPE,
    toChange: fakeNoteToChange,
  });
}

export function createFakeNotesRepo(
  doc: ConstructorParameters<typeof VersionedEntityRepository>[1],
  tableName: string,
  nowIso?: () => string,
): VersionedEntityRepository<FakeNote, FakeNoteItem> {
  return new VersionedEntityRepository<FakeNote, FakeNoteItem>(
    {
      conflictLabel: 'fake note',
      keyForId: (id) => keys.fixture.meta(id),
      idOf: (n) => n.id,
      toEntity: toFakeNoteEntity,
      toItem: toFakeNoteItem,
      isDeleted: (n) => n.deleted,
      nowIso,
      sync: {
        changeType: FAKE_NOTE_CHANGE_TYPE,
        userIdOf: (n) => n.userId,
        createPayloadHash: fakeNotePayloadHash,
      },
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
  };
}

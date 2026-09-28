import type { FixtureNote } from '@gagnechris/shared';
import { keys } from '@gagnechris/data';

export type FixtureNoteItem = {
  pk: string;
  sk: string;
  entityType: 'fixtureNote';
  id: string;
  userId: string;
  title: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  ttl?: number;
};

export function isDeletedFixtureNote(entity: FixtureNote): boolean {
  return entity.deleted;
}

export function toEntity(item: FixtureNoteItem): FixtureNote {
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

export function toItem(entity: FixtureNote): FixtureNoteItem {
  const { pk, sk } = keys.fixture.meta(entity.id);
  const item: FixtureNoteItem = {
    pk,
    sk,
    entityType: 'fixtureNote',
    id: entity.id,
    userId: entity.userId,
    title: entity.title,
    body: entity.body,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deleted: entity.deleted,
  };
  return item;
}

/** META item for a tombstoned note (includes DynamoDB TTL). */
export function toTombstoneItem(
  entity: FixtureNote,
  ttl: number,
): FixtureNoteItem {
  return { ...toItem(entity), ttl };
}

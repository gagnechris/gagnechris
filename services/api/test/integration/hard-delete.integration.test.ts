import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ConflictError } from '../../src/data/errors.js';
import {
  VersionedEntityRepository,
  type VersionedEntity,
} from '../../src/data/versioned-entity-repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

type Note = VersionedEntity & { id: string; title: string };

type NoteItem = {
  pk: string;
  sk: string;
  id: string;
  title: string;
  version: number;
  updatedAt: string;
};

describe('hard-delete recreate guard (DynamoDB Local)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('hard-delete');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
  });

  it('refuses updateIfVersion after a hard DeleteItem (attribute_exists guard)', async () => {
    const repo = new VersionedEntityRepository<Note, NoteItem>(
      {
        conflictLabel: 'note',
        keyForId: (id) => ({ pk: `NOTE#${id}`, sk: 'META' }),
        idOf: (n) => n.id,
        toEntity: (item) => ({
          id: item.id,
          title: item.title,
          version: item.version,
          updatedAt: item.updatedAt,
        }),
        toItem: (n) => ({
          pk: `NOTE#${n.id}`,
          sk: 'META',
          id: n.id,
          title: n.title,
          version: n.version,
          updatedAt: n.updatedAt,
        }),
      },
      doc,
      tableName,
    );

    const created = await repo.create({
      id: NOTE_ID,
      title: 'alive',
      version: 1,
      updatedAt: '2026-10-02T10:00:00.000Z',
    });

    await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { pk: `NOTE#${NOTE_ID}`, sk: 'META' },
      }),
    );

    await expect(
      repo.updateIfVersion(NOTE_ID, created.version, {
        id: NOTE_ID,
        title: 'resurrected',
        version: 2,
        updatedAt: '2026-10-02T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await repo.get(NOTE_ID)).toBeUndefined();
  });
});

import {
  BatchGetCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { batchGetAllWithDocClient } from '@gagnechris/data';

type Owned = { id: string; userId: string; deleted: boolean };

/**
 * The caller's live entities among `ids`, in their order, from one
 * BatchGetItem (callers cap ids at its 100 keys). Another user's row or a
 * tombstone is left out, as its GET would 404.
 */
export async function batchGetOwned<T extends Owned>(
  doc: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  ids: readonly string[],
  keyFor: (userId: string, id: string) => Record<string, string>,
  mapItem: (raw: unknown) => T,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const responses = await batchGetAllWithDocClient(
    (RequestItems) => doc.send(new BatchGetCommand({ RequestItems })),
    { [tableName]: { Keys: unique.map((id) => keyFor(userId, id)) } },
  );
  const byId = new Map<string, T>();
  for (const raw of responses[tableName] ?? []) {
    const entity = mapItem(raw);
    if (entity.userId === userId && !entity.deleted)
      byId.set(entity.id, entity);
  }
  return unique.flatMap((id) => byId.get(id) ?? []);
}

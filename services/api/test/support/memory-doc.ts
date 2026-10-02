/**
 * In-memory DynamoDBDocumentClient for sync GSI unit tests (CHR-153 / CHR-162).
 */
import { vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}\0${item.sk}`;
}

function checkPutCondition(
  store: Map<string, Record<string, unknown>>,
  input: Record<string, unknown>,
): void {
  const item = input.Item as Record<string, unknown>;
  const key = { pk: item.pk as string, sk: item.sk as string };
  const k = itemKey(key);
  const cond = input.ConditionExpression as string | undefined;
  if (cond === 'attribute_not_exists(pk)') {
    if (store.has(k)) {
      throw { name: 'ConditionalCheckFailedException' };
    }
  } else if (cond?.includes('version = :v')) {
    const existing = store.get(k);
    const expected = (
      input.ExpressionAttributeValues as Record<string, unknown>
    )?.[':v'];
    if (!existing || existing.version !== expected) {
      throw { name: 'ConditionalCheckFailedException' };
    }
  }
}

export function createMemoryDoc(): {
  doc: DynamoDBDocumentClient;
  store: Map<string, Record<string, unknown>>;
} {
  const store = new Map<string, Record<string, unknown>>();

  const send = vi.fn(async (command: unknown) => {
    const cmd = command as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    const name = cmd.constructor.name;

    if (name === 'GetCommand') {
      const key = cmd.input.Key as { pk: string; sk: string };
      const item = store.get(itemKey(key));
      return item ? { Item: { ...item } } : {};
    }

    if (name === 'PutCommand') {
      checkPutCondition(store, cmd.input);
      const item = cmd.input.Item as Record<string, unknown>;
      store.set(itemKey({ pk: item.pk as string, sk: item.sk as string }), {
        ...item,
      });
      return {};
    }

    if (name === 'TransactWriteCommand') {
      const items = cmd.input.TransactItems as Array<{
        Put?: Record<string, unknown>;
      }>;
      // Validate all conditions first (transactional).
      for (const entry of items) {
        if (entry.Put) checkPutCondition(store, entry.Put);
      }
      for (const entry of items) {
        if (!entry.Put) continue;
        const item = entry.Put.Item as Record<string, unknown>;
        store.set(itemKey({ pk: item.pk as string, sk: item.sk as string }), {
          ...item,
        });
      }
      return {};
    }

    if (name === 'DeleteCommand') {
      const key = cmd.input.Key as { pk: string; sk: string };
      store.delete(itemKey(key));
      return {};
    }

    if (name === 'QueryCommand') {
      const values = (cmd.input.ExpressionAttributeValues ?? {}) as Record<
        string,
        string
      >;
      const indexName = cmd.input.IndexName as string | undefined;
      const sinceSk = values[':sinceSk'];
      const pk = values[':pk'];
      let rows = [...store.values()];

      if (indexName === 'gsi3') {
        rows = rows.filter((item) => item.syncPk === pk);
        if (sinceSk) {
          rows = rows.filter((item) => (item.syncSk as string) >= sinceSk);
        }
        rows.sort((a, b) =>
          (a.syncSk as string).localeCompare(b.syncSk as string),
        );
      } else {
        rows = rows.filter((item) => item.pk === pk);
        if (sinceSk) {
          rows = rows.filter((item) => (item.sk as string) > sinceSk);
        }
        rows.sort((a, b) => (a.sk as string).localeCompare(b.sk as string));
      }

      const startKey = cmd.input.ExclusiveStartKey as
        Record<string, unknown> | undefined;
      if (startKey && indexName === 'gsi3') {
        const startSk = startKey.syncSk as string;
        rows = rows.filter((item) => (item.syncSk as string) > startSk);
      } else if (startKey) {
        const startSk = startKey.sk as string;
        rows = rows.filter((item) => (item.sk as string) > startSk);
      }

      const limit = cmd.input.Limit as number | undefined;
      const sliced = limit ? rows.slice(0, limit) : rows;
      const last =
        limit && rows.length > sliced.length ? sliced.at(-1) : undefined;
      return {
        Items: sliced.map((r) => ({ ...r })),
        LastEvaluatedKey: last
          ? {
              pk: last.pk,
              sk: last.sk,
              syncPk: last.syncPk,
              syncSk: last.syncSk,
            }
          : undefined,
      };
    }

    throw new Error(`Unhandled command ${name}`);
  });

  return { doc: { send } as unknown as DynamoDBDocumentClient, store };
}

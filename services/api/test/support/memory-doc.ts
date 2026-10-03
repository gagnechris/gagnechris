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
    const values = (input.ExpressionAttributeValues ?? {}) as Record<
      string,
      unknown
    >;
    const expected = values[':v'];
    const currentVersion =
      existing && typeof existing.version === 'number'
        ? existing.version
        : existing
          ? 0
          : undefined;
    const versionOk =
      existing !== undefined &&
      (currentVersion === expected ||
        (existing.version === undefined && expected === 0));
    if (!existing || !versionOk) {
      throw { name: 'ConditionalCheckFailedException' };
    }
  }
}

/** Conditions used on claim deletes (CHR-187): owner-pointer checks only. */
function checkDeleteCondition(
  store: Map<string, Record<string, unknown>>,
  input: Record<string, unknown>,
): void {
  const cond = input.ConditionExpression as string | undefined;
  if (!cond) return;
  const existing = store.get(itemKey(input.Key as { pk: string; sk: string }));
  const values = (input.ExpressionAttributeValues ?? {}) as Record<
    string,
    unknown
  >;
  const pointsAtId = existing?.noteId === values[':id'];
  const ok = cond.startsWith('attribute_not_exists(pk) OR')
    ? !existing || pointsAtId
    : existing !== undefined && pointsAtId;
  if (!ok) throw { name: 'ConditionalCheckFailedException' };
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
        Delete?: Record<string, unknown>;
      }>;
      // Validate all conditions first (transactional).
      const reasons: Array<{ Code?: string }> = items.map(() => ({}));
      let failed = false;
      for (let i = 0; i < items.length; i += 1) {
        const entry = items[i]!;
        try {
          if (entry.Put) checkPutCondition(store, entry.Put);
          if (entry.Delete) checkDeleteCondition(store, entry.Delete);
        } catch {
          reasons[i] = { Code: 'ConditionalCheckFailed' };
          failed = true;
        }
      }
      if (failed) {
        throw {
          name: 'TransactionCanceledException',
          CancellationReasons: reasons,
        };
      }
      for (const entry of items) {
        if (entry.Delete) {
          store.delete(itemKey(entry.Delete.Key as { pk: string; sk: string }));
        }
        if (!entry.Put) continue;
        const item = entry.Put.Item as Record<string, unknown>;
        store.set(itemKey({ pk: item.pk as string, sk: item.sk as string }), {
          ...item,
        });
      }
      return {};
    }

    if (name === 'DeleteCommand') {
      checkDeleteCondition(store, cmd.input);
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
      const keyCond = (cmd.input.KeyConditionExpression as string) ?? '';
      let rows = [...store.values()];

      if (indexName === 'gsi3') {
        rows = rows.filter((item) => item.syncPk === pk);
        if (sinceSk) {
          rows = rows.filter((item) => (item.syncSk as string) >= sinceSk);
        }
        rows.sort((a, b) =>
          (a.syncSk as string).localeCompare(b.syncSk as string),
        );
      } else if (indexName === 'gsi1') {
        rows = rows.filter((item) => item.gsi1pk === pk);
        if (keyCond.includes('BETWEEN') && values[':from'] && values[':to']) {
          const from = values[':from'];
          const to = values[':to'];
          rows = rows.filter((item) => {
            const sk = item.gsi1sk as string;
            return sk >= from && sk <= to;
          });
        } else if (
          keyCond.includes('begins_with') &&
          typeof values[':prefix'] === 'string'
        ) {
          const prefix = values[':prefix'];
          rows = rows.filter((item) =>
            String(item.gsi1sk ?? '').startsWith(prefix),
          );
        }
        rows.sort((a, b) =>
          String(a.gsi1sk ?? '').localeCompare(String(b.gsi1sk ?? '')),
        );
      } else if (indexName === 'gsi2') {
        rows = rows.filter((item) => item.gsi2pk === pk);
        if (keyCond.includes('BETWEEN') && values[':from'] && values[':to']) {
          const from = values[':from'];
          const to = values[':to'];
          rows = rows.filter((item) => {
            const sk = item.gsi2sk as string;
            return sk >= from && sk <= to;
          });
        } else if (
          keyCond.includes('begins_with') &&
          typeof values[':prefix'] === 'string'
        ) {
          const prefix = values[':prefix'];
          rows = rows.filter((item) =>
            String(item.gsi2sk ?? '').startsWith(prefix),
          );
        }
        rows.sort((a, b) =>
          String(a.gsi2sk ?? '').localeCompare(String(b.gsi2sk ?? '')),
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
      } else if (startKey && indexName === 'gsi1') {
        const startSk = startKey.gsi1sk as string;
        rows = rows.filter((item) => (item.gsi1sk as string) > startSk);
      } else if (startKey && indexName === 'gsi2') {
        const startSk = startKey.gsi2sk as string;
        rows = rows.filter((item) => (item.gsi2sk as string) > startSk);
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
        // Like DynamoDB: base keys plus only the queried index's keys.
        LastEvaluatedKey: last
          ? {
              pk: last.pk,
              sk: last.sk,
              ...(indexName === 'gsi3'
                ? { syncPk: last.syncPk, syncSk: last.syncSk }
                : {}),
              ...(indexName === 'gsi1'
                ? { gsi1pk: last.gsi1pk, gsi1sk: last.gsi1sk }
                : {}),
              ...(indexName === 'gsi2'
                ? { gsi2pk: last.gsi2pk, gsi2sk: last.gsi2sk }
                : {}),
            }
          : undefined,
      };
    }

    throw new Error(`Unhandled command ${name}`);
  });

  return { doc: { send } as unknown as DynamoDBDocumentClient, store };
}

import { vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type FakeCommand = {
  constructor: { name: string };
  input: Record<string, unknown>;
};

function itemsForKeys(
  keys: Array<{ sk?: string }>,
  meta: unknown,
  published: unknown | undefined,
): unknown[] {
  const out: unknown[] = [];
  for (const key of keys) {
    if (key.sk === 'META' && meta) out.push(meta);
    if (key.sk === 'PUBLISHED' && published) out.push(published);
  }
  return out;
}

/** Respond to BatchGet (META+PUBLISHED) and optional writes (publishable repos). */
export function mockPair(
  meta: unknown,
  published?: unknown,
  onWrite?: (command: FakeCommand) => Promise<unknown> | unknown,
): (command: FakeCommand) => Promise<unknown> {
  return async (command) => {
    if (command.constructor.name === 'BatchGetCommand') {
      const requestItems = command.input.RequestItems as Record<
        string,
        { Keys: Array<{ sk?: string }> }
      >;
      const table = Object.keys(requestItems)[0]!;
      const keys = requestItems[table]!.Keys;
      return {
        Responses: { [table]: itemsForKeys(keys, meta, published) },
      };
    }
    if (command.constructor.name === 'GetCommand') {
      const key = command.input.Key as { sk?: string };
      if (key.sk === 'PUBLISHED') {
        return published ? { Item: published } : {};
      }
      return meta ? { Item: meta } : {};
    }
    if (onWrite) {
      return (await onWrite(command)) ?? {};
    }
    return {};
  };
}

export function mockDoc(impl: (command: FakeCommand) => Promise<unknown>): {
  doc: DynamoDBDocumentClient;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(async (command: FakeCommand) => impl(command));
  return {
    doc: { send } as unknown as DynamoDBDocumentClient,
    send,
  };
}

/** When tests only need a document client without inspecting `send`. */
export function mockDocClient(
  impl: (command: FakeCommand) => Promise<unknown>,
): DynamoDBDocumentClient {
  return mockDoc(impl).doc;
}

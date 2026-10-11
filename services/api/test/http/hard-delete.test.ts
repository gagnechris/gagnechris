import { describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-hard-delete';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

describe('hard-delete recreate guard (DynamoDB Local)', () => {
  const h = useApi('hard-delete');

  const call = (
    method: string,
    path: string,
    opts: { body?: unknown; ifMatch?: string } = {},
  ) =>
    h.api.request(method, path, {
      body: opts.body,
      headers: opts.ifMatch ? { 'if-match': opts.ifMatch } : undefined,
      claims: notebookUser(USER),
    });

  const readRow = async (key: Record<string, string>) =>
    (
      await h.doc.send(
        new GetCommand({
          TableName: h.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      )
    ).Item;

  for (const entity of [
    {
      name: 'note',
      path: `/api/notebook/notes/${NOTE_ID}`,
      key: keys.notebook.note.meta(USER, NOTE_ID),
      create: () =>
        call('POST', '/api/notebook/notes', {
          body: { id: NOTE_ID, area: 'work', type: 'page', title: 'alive' },
        }),
    },
    {
      name: 'task',
      path: `/api/notebook/tasks/${TASK_ID}`,
      key: keys.notebook.task.meta(USER, TASK_ID),
      create: () =>
        call('POST', '/api/notebook/tasks', {
          body: { id: TASK_ID, area: 'work', title: 'alive' },
        }),
    },
  ]) {
    it(`refuses a versioned ${entity.name} write after a hard DeleteItem (404, never recreated)`, async () => {
      const created = await entity.create();
      expect(created.status).toBe(201);
      const version = created.body.version as number;

      await h.doc.send(
        new DeleteCommand({ TableName: h.tableName, Key: entity.key }),
      );

      const attempts: [string, Parameters<typeof call>[2]][] = [
        ['PUT', { body: { title: 'resurrected' }, ifMatch: `"${version}"` }],
        ['PUT', { body: { version, title: 'resurrected' } }],
        ['DELETE', { ifMatch: `"${version}"` }],
        ['DELETE', { body: { version } }],
      ];
      for (const [method, opts] of attempts) {
        const res = await call(method, entity.path, opts);
        expect(res.status, `${method} ${JSON.stringify(opts)}`).toBe(404);
      }

      expect(await readRow(entity.key)).toBeUndefined();
      expect((await call('GET', entity.path)).status).toBe(404);
    });
  }
});

import {
  ConflictErrorResponseSchema,
  PreconditionFailedErrorResponseSchema,
} from '@gagnechris/shared';
import { describe, expect, it } from 'vitest';
import { adminServer, makePost } from '../test/adminServer';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';

const send = (
  fetch: (input: Request) => Promise<Response>,
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

const conflictBody = async (response: Response) => {
  expect(response.status).toBe(409);
  return ConflictErrorResponseSchema.parse(await response.json());
};

describe('the fake APIs answer write conflicts as the API does', () => {
  it('a stale body version is a 409 version_conflict with the current copy', async () => {
    const server = notebookServer(
      [makeNote('n1', 'body', { version: 3 })],
      [makeTask('t1', 'Call', { version: 2 })],
    );
    const note = await conflictBody(
      await send(server.fetch, 'PUT', '/api/notebook/notes/n1', {
        version: 1,
        title: 'x',
      }),
    );
    expect(note).toMatchObject({
      error: 'version_conflict',
      currentVersion: 3,
    });
    const task = await conflictBody(
      await send(server.fetch, 'POST', '/api/notebook/tasks/t1/complete', {
        version: 1,
      }),
    );
    expect(task).toMatchObject({
      error: 'version_conflict',
      currentVersion: 2,
    });
  });

  it('a stale If-Match is a 412 precondition_failed', async () => {
    const server = notebookServer([makeNote('n1', 'body', { version: 3 })]);
    const response = await send(
      server.fetch,
      'PUT',
      '/api/notebook/notes/n1',
      { version: 3, title: 'x' },
      { 'if-match': 'W/"2"' },
    );
    expect(response.status).toBe(412);
    expect(
      PreconditionFailedErrorResponseSchema.parse(await response.json()),
    ).toMatchObject({ error: 'precondition_failed', currentVersion: 3 });
    const any = await send(
      server.fetch,
      'PUT',
      '/api/notebook/notes/n1',
      { version: 1, title: 'y' },
      { 'if-match': '*' },
    );
    expect(any.status).toBe(200);
  });

  it('a write to a deleted note is a 409 deleted', async () => {
    const server = notebookServer([makeNote('n1', 'body')]);
    server.deleteNote('n1');
    const body = await conflictBody(
      await send(server.fetch, 'PUT', '/api/notebook/notes/n1', {
        version: 2,
        title: 'x',
      }),
    );
    expect(body.error).toBe('deleted');
  });

  it('a stale admin write is a 409 version_conflict', async () => {
    const server = adminServer([makePost('p1', { version: 4 })]);
    const post = await conflictBody(
      await send(server.fetch, 'PUT', '/api/admin/posts/p1', {
        version: 1,
        title: 'x',
      }),
    );
    expect(post).toMatchObject({
      error: 'version_conflict',
      currentVersion: 4,
    });
    const home = await conflictBody(
      await send(server.fetch, 'PUT', '/api/admin/home', { version: 0 }),
    );
    expect(home.error).toBe('version_conflict');
  });
});

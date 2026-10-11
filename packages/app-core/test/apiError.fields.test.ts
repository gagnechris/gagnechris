import { createApiClient } from '@gagnechris/api-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, createTask } from '../src/query/api.js';

describe('ApiError from an error response', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reject = (body: unknown, status = 400) =>
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    );

  const createError = async () => {
    const client = createApiClient({ baseUrl: 'https://api.test' });
    const err = await createTask(client, {
      id: '01JTASKAAAAAAAAAAAAAAAAAAA',
      area: 'work',
      title: 'Call Sam',
      description: '',
      priority: 'med',
      status: 'todo',
      tags: [],
      noteId: '01JNOTEAAAAAAAAAAAAAAAAAAA',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  };

  test('carries the field codes from the response body', async () => {
    reject({
      error: 'bad_request',
      message: 'noteId must reference an existing note',
      fields: { noteId: 'not_found' },
    });
    const err = await createError();
    expect(err.status).toBe(400);
    expect(err.error).toBe('bad_request');
    expect(err.fields).toEqual({ noteId: 'not_found' });
  });

  test('has no field codes when the body has none', async () => {
    reject({ error: 'bad_request', message: 'Bad request' });
    expect((await createError()).fields).toBeUndefined();
  });

  test("uses the API's message for a 4xx", async () => {
    reject({ error: 'bad_request', message: 'Unknown project id: 01X' });
    expect((await createError()).message).toBe('Unknown project id: 01X');
  });

  test('keeps the status text for a 5xx or a body with no message', async () => {
    reject({ error: 'internal', message: 'Internal error' }, 500);
    expect((await createError()).message).toBe('Could not create task (500).');
    reject({ error: 'bad_request' });
    expect((await createError()).message).toBe('Could not create task (400).');
  });
});

import { createApiClient } from '@gagnechris/api-client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, createTask } from '../src/query/api.js';

describe('ApiError from a 400', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reject = (body: unknown) =>
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify(body), {
          status: 400,
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
});

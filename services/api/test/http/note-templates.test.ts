import { describe, expect, it } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ITEM_SCHEMAS, buildNoteTemplateItem, keys } from '@gagnechris/data';
import {
  NOTE_TEMPLATE_LIMIT_MESSAGE,
  NOTE_TEMPLATE_MAX_BYTES,
  NOTE_TEMPLATE_MAX_COUNT,
  NOTE_TEMPLATE_NAME_MAX_LENGTH,
} from '@gagnechris/shared';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-note-templates-http';
const OTHER = 'user-note-templates-http-other';
const FULL = 'user-note-templates-http-full';
const PATH = '/api/notebook/templates/notes';
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
const BODY = '## {{date}}\n\n## Questions\n\n[ ] Send feedback\n';

const h = useApi('note-templates-http');
const { call } = apiCalls(h, { user: USER });

const storedRow = async (userId: string, id: string) =>
  (
    await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.noteTemplate(userId, id),
      }),
    )
  ).Item;

describe('note templates over HTTP (DynamoDB Local)', () => {
  it('rejects task embeds on create and edit but allows task lines and code', async () => {
    const embed = '## Agenda\n{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}\n';
    const id = ulid();
    const created = await call('POST', PATH, {
      body: { id, name: 'Standup', bodyMarkdown: embed },
    });
    expect(created.status).toBe(400);
    expect(created.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields: { bodyMarkdown: 'custom' },
    });
    expect(await storedRow(USER, id)).toBeUndefined();

    const fenced = '```\n{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}\n```\n[ ] Ask\n';
    const ok = await call('POST', PATH, {
      body: { id, name: 'Standup', bodyMarkdown: fenced },
    });
    expect(ok.status).toBe(201);

    const edited = await call('PUT', `${PATH}/${id}`, {
      body: { version: 1, bodyMarkdown: embed },
    });
    expect(edited.status).toBe(400);
    expect(edited.body).toEqual(created.body);
    expect((await call('GET', `${PATH}/${id}`)).body).toMatchObject({
      bodyMarkdown: fenced,
      version: 1,
    });
  });

  it('creates, lists, renames, edits and deletes a template', async () => {
    const id = ulid();
    const created = await call('POST', PATH, {
      body: { id, name: '  HM Screen Interview ', bodyMarkdown: BODY },
    });
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"1"');
    expect(created.body).toEqual({
      id,
      name: 'HM Screen Interview',
      bodyMarkdown: BODY,
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
    });
    expect(
      ITEM_SCHEMAS.noteTemplate.parse(await storedRow(USER, id)),
    ).toMatchObject({ entityType: 'noteTemplate', userId: USER, id });

    const replay = await call('POST', PATH, {
      body: { id, name: 'HM Screen Interview', bodyMarkdown: BODY },
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(created.body);

    const mismatch = await call('POST', PATH, {
      body: { id, name: 'Something else' },
    });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toMatchObject({
      error: 'payload_mismatch',
      currentVersion: 1,
      current: created.body,
    });

    const second = ulid();
    expect(
      (await call('POST', PATH, { body: { id: second, name: '1:1' } })).body,
    ).toMatchObject({ id: second, name: '1:1', bodyMarkdown: '' });

    const list = await call('GET', PATH);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      items: [created.body, expect.objectContaining({ id: second })],
    });

    const renamed = await call('PUT', `${PATH}/${id}`, {
      body: { name: 'HM screen' },
      ifMatch: '"1"',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.etag).toBe('"2"');
    expect(renamed.body).toMatchObject({
      name: 'HM screen',
      bodyMarkdown: BODY,
      version: 2,
    });

    const edited = await call('PUT', `${PATH}/${id}`, {
      body: { version: 2, bodyMarkdown: '[ ] Book the debrief' },
    });
    expect(edited.body).toMatchObject({
      name: 'HM screen',
      bodyMarkdown: '[ ] Book the debrief',
      version: 3,
    });
    expect(await call('GET', `${PATH}/${id}`)).toMatchObject({
      status: 200,
      etag: '"3"',
      body: edited.body,
    });

    const stale = await call('PUT', `${PATH}/${id}`, {
      body: { name: 'other device' },
      ifMatch: '"2"',
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toEqual({
      error: 'precondition_failed',
      message: 'Version conflict: expected 2, current 3',
      currentVersion: 3,
      current: edited.body,
    });
    const staleBody = await call('PUT', `${PATH}/${id}`, {
      body: { version: 1, name: 'other device' },
    });
    expect(staleBody.status).toBe(409);
    expect(staleBody.body).toMatchObject({ error: 'version_conflict' });

    const noVersion = await call('PUT', `${PATH}/${id}`, {
      body: { name: 'x' },
    });
    expect(noVersion.status).toBe(400);

    const staleDelete = await call('DELETE', `${PATH}/${id}`, {
      body: { version: 2 },
    });
    expect(staleDelete.status).toBe(409);

    const deleted = await call('DELETE', `${PATH}/${id}`, { ifMatch: '"3"' });
    expect(deleted.status).toBe(204);
    expect(await storedRow(USER, id)).toBeUndefined();
    expect((await call('GET', `${PATH}/${id}`)).status).toBe(404);
    expect(
      (await call('DELETE', `${PATH}/${id}`, { body: { version: 3 } })).status,
    ).toBe(404);
    expect((await call('GET', PATH)).body).toEqual({
      items: [expect.objectContaining({ id: second })],
    });
  });

  it("keeps each user's templates to themselves", async () => {
    const id = ulid();
    await call('POST', PATH, { body: { id, name: 'Mine' } });
    expect((await call('GET', PATH, { user: OTHER })).body).toEqual({
      items: [],
    });
    expect((await call('GET', `${PATH}/${id}`, { user: OTHER })).status).toBe(
      404,
    );
    expect(
      (
        await call('PUT', `${PATH}/${id}`, {
          user: OTHER,
          body: { version: 1, name: 'Theirs' },
        })
      ).status,
    ).toBe(404);
  });

  it('validates the name and text, with 413 over the size limits', async () => {
    const blank = await call('POST', PATH, {
      body: { id: ulid(), name: '   ' },
    });
    expect(blank.status).toBe(400);
    expect(blank.body).toMatchObject({ fields: { name: 'too_small' } });

    const missing = await call('POST', PATH, { body: { id: ulid() } });
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ fields: { name: 'invalid_type' } });

    const big = await call('POST', PATH, {
      body: {
        id: ulid(),
        name: 'Big',
        bodyMarkdown: 'a'.repeat(NOTE_TEMPLATE_MAX_BYTES + 1),
      },
    });
    expect(big.status).toBe(413);
    expect(big.body).toEqual({
      error: 'payload_too_large',
      message: `Template is over the ${NOTE_TEMPLATE_MAX_BYTES / 1000} KB limit`,
      fields: { bodyMarkdown: 'too_big' },
    });

    const longName = await call('POST', PATH, {
      body: { id: ulid(), name: 'n'.repeat(NOTE_TEMPLATE_NAME_MAX_LENGTH + 1) },
    });
    expect(longName.status).toBe(413);

    const atLimit = await call('POST', PATH, {
      body: {
        id: ulid(),
        name: 'n'.repeat(NOTE_TEMPLATE_NAME_MAX_LENGTH),
        bodyMarkdown: 'a'.repeat(NOTE_TEMPLATE_MAX_BYTES),
      },
    });
    expect(atLimit.status).toBe(201);

    expect((await call('GET', `${PATH}/not-a-ulid`)).status).toBe(400);
  });

  it(`caps a user at ${NOTE_TEMPLATE_MAX_COUNT} templates`, async () => {
    const at = new Date().toISOString();
    for (let i = 0; i < NOTE_TEMPLATE_MAX_COUNT; i += 1) {
      await h.doc.send(
        new PutCommand({
          TableName: h.tableName,
          Item: buildNoteTemplateItem(FULL, {
            id: ulid(),
            name: `Template ${i}`,
            bodyMarkdown: '',
            version: 1,
            createdAt: at,
            updatedAt: at,
          }),
        }),
      );
    }
    expect((await call('GET', PATH, { user: FULL })).body.items).toHaveLength(
      NOTE_TEMPLATE_MAX_COUNT,
    );
    const over = await call('POST', PATH, {
      user: FULL,
      body: { id: ulid(), name: 'One more' },
    });
    expect(over.status).toBe(409);
    expect(over.body).toEqual({
      error: 'conflict',
      message: NOTE_TEMPLATE_LIMIT_MESSAGE,
    });
  });
});

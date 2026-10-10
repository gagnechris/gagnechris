import { describe, expect, it } from 'vitest';
import {
  DAILY_TEMPLATE_MAX_BYTES,
  DEFAULT_DAILY_TEMPLATES,
} from '@gagnechris/shared';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import { NotesRepository } from '../src/notes/repository.js';
import { createTemplateRoutes } from '../src/templates/handlers.js';
import { DailyTemplatesRepository } from '../src/templates/repository.js';

const TABLE = 'gagnechris-templates-test';
const USER = 'user-templates-1';
const OTHER = 'user-templates-2';
const NOW = '2026-10-09T12:00:00.000Z';

function setup() {
  const { doc, store } = createMemoryDoc();
  const templates = new DailyTemplatesRepository(doc, TABLE, () => NOW);
  const notes = new NotesRepository(doc, TABLE, () => NOW);
  const routes = [
    ...createTemplateRoutes(templates),
    ...createNoteRoutes(notes, undefined, templates),
  ];
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
    sub = USER,
  ) => {
    const res = await dispatchRoutes(
      routes,
      makeEvent(method, path, { body, headers, jwtClaims: { sub } }),
      method,
      path,
    );
    return {
      status: res?.statusCode,
      etag: res?.headers?.ETag,
      body: JSON.parse(String(res?.body ?? 'null')),
    };
  };
  return { call, store };
}

const WORK = '/api/notebook/templates/daily/work';

describe('daily template handlers', () => {
  it('serves the built-in template until one is saved', async () => {
    const { call, store } = setup();
    const res = await call('GET', WORK);
    expect(res.status).toBe(200);
    expect(res.etag).toBe('"0"');
    expect(res.body).toEqual({
      area: 'work',
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.work,
      isDefault: true,
      version: 0,
      updatedAt: null,
    });
    expect(store.size).toBe(0);
  });

  it('saves with If-Match, rejects a stale version, and resets to the default', async () => {
    const { call, store } = setup();
    const saved = await call(
      'PUT',
      WORK,
      { bodyMarkdown: '## Focus\n- [ ] inbox zero\n' },
      { 'if-match': '"0"' },
    );
    expect(saved.status).toBe(200);
    expect(saved.etag).toBe('"1"');
    expect(saved.body).toMatchObject({
      bodyMarkdown: '## Focus\n- [ ] inbox zero\n',
      isDefault: false,
      version: 1,
      updatedAt: NOW,
    });

    const stale = await call(
      'PUT',
      WORK,
      { bodyMarkdown: 'other device' },
      { 'if-match': '"0"' },
    );
    expect(stale.status).toBe(412);
    expect(stale.body.current).toMatchObject({ version: 1 });

    const staleBody = await call('PUT', WORK, {
      version: 0,
      bodyMarkdown: 'x',
    });
    expect(staleBody.status).toBe(409);

    expect(
      (await call('PUT', WORK, { bodyMarkdown: 'no version' })).status,
    ).toBe(400);

    const staleReset = await call('DELETE', WORK, { version: 0 });
    expect(staleReset.status).toBe(409);
    const unchanged = await call(
      'DELETE',
      '/api/notebook/templates/daily/personal',
      {
        version: 0,
      },
    );
    expect(unchanged.body).toMatchObject({ isDefault: true, version: 0 });

    const reset = await call('DELETE', WORK, undefined, { 'if-match': '"1"' });
    expect(reset.status).toBe(200);
    expect(reset.etag).toBe('"2"');
    expect(reset.body).toMatchObject({
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.work,
      isDefault: true,
      version: 2,
    });
    expect([...store.values()][0]).toMatchObject({ bodyMarkdown: '' });

    expect(
      (await call('PUT', WORK, { version: 1, bodyMarkdown: 'Stale' })).status,
    ).toBe(409);
    const again = await call('PUT', WORK, { version: 2, bodyMarkdown: 'New' });
    expect(again.body).toMatchObject({
      version: 3,
      bodyMarkdown: 'New',
      isDefault: false,
    });
  });

  it('rejects task lines and embeds but allows checklists and code', async () => {
    const { call } = setup();
    const put = (bodyMarkdown: string) =>
      call('PUT', WORK, { version: 0, bodyMarkdown });
    const task = await put('## Plans\n[ ] call the bank\n');
    expect(task.status).toBe(400);
    expect(task.body.fields).toHaveProperty('bodyMarkdown');
    expect((await put('{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}\n')).status).toBe(
      400,
    );
    expect((await put('```\n[ ] not a task\n```\n- [ ] ok\n')).status).toBe(
      200,
    );
  });

  it('answers 413 over the size limit', async () => {
    const { call } = setup();
    const res = await call('PUT', WORK, {
      version: 0,
      bodyMarkdown: 'a'.repeat(DAILY_TEMPLATE_MAX_BYTES + 1),
    });
    expect(res.status).toBe(413);
  });

  it("starts an empty day from the user's own template, filled for that day", async () => {
    const { call } = setup();
    await call('PUT', WORK, {
      version: 0,
      bodyMarkdown: '# {{date}}\n{{area}} {{weekday}} {{unknown}}\n',
    });
    const day = await call('GET', '/api/notebook/notes/daily/work/2026-10-16');
    expect(day.body).toMatchObject({
      exists: false,
      version: 0,
      bodyMarkdown: '',
      templateMarkdown: '# Friday, October 16\nWork Friday {{unknown}}\n',
    });

    const personal = await call(
      'GET',
      '/api/notebook/notes/daily/personal/2026-10-16',
    );
    expect(personal.body.templateMarkdown).toBe(
      DEFAULT_DAILY_TEMPLATES.personal,
    );

    const other = await call(
      'GET',
      '/api/notebook/notes/daily/work/2026-10-16',
      undefined,
      undefined,
      OTHER,
    );
    expect(other.body.templateMarkdown).toBe(
      '## Focus for Friday\n- \n\n## Standup\n\n## Meetings\n\n## Notes\n\n## Tomorrow\n- \n',
    );
  });

  it('never changes a note that already exists', async () => {
    const { call } = setup();
    await call('PUT', '/api/notebook/notes/daily/work/2026-10-16', {
      id: '01ARZ3NDEKTSV4RRFFQ48JMCZC',
      bodyMarkdown: 'Started',
    });
    await call('PUT', WORK, { version: 0, bodyMarkdown: 'Changed' });
    const day = await call('GET', '/api/notebook/notes/daily/work/2026-10-16');
    expect(day.body).toMatchObject({ bodyMarkdown: 'Started', version: 1 });
    expect(day.body.templateMarkdown).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_DAILY_TEMPLATES,
  fillDailyTemplate,
  taskEmbedIds,
} from '@gagnechris/shared';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-carry-in';
const FRI = '2026-10-02';
const MON = '2026-10-05';
const id = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5H${String(n).padStart(2, '0')}`;

describe('opening a daily note carries in open tasks', () => {
  const h = useApi('carry-in');

  async function call(method: string, path: string, body?: unknown) {
    const res = await h.api.request(method, path, {
      body,
      claims: notebookUser(USER),
    });
    return {
      status: res.status,
      body: (res.body ?? {}) as Record<string, unknown>,
    };
  }

  const task = (n: number, fields: Record<string, unknown> = {}) =>
    call('POST', '/api/notebook/tasks', {
      id: id(n),
      area: 'work',
      title: `Task ${n}`,
      ...fields,
    });

  const open = (date: string, noteId: string, area = 'work') =>
    call('POST', `/api/notebook/notes/daily/${area}/${date}/open`, {
      id: noteId,
    });

  async function dailyClaims(): Promise<number> {
    const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
    return (out.Items ?? []).filter((item) =>
      String(item.pk).includes('#DAILY#'),
    ).length;
  }

  it('after a skipped weekend, Monday carries in what is still open from earlier days', async () => {
    await task(1);
    await task(2, { status: 'done' });
    await task(3, { startDate: MON });
    await task(4, { someday: true });
    await task(5, { startDate: '2026-10-09' });
    await task(6, { startDate: '2026-10-01' });
    await task(7, { area: 'personal' });
    const fridayNote = await call(
      'PUT',
      `/api/notebook/notes/daily/work/${FRI}`,
      { id: id(80), bodyMarkdown: `{{task:${id(1)}}}\n{{task:${id(2)}}}` },
    );
    expect(fridayNote.status).toBe(200);

    const monday = await open(MON, id(81));
    expect(monday.status).toBe(200);
    expect(monday.body).toMatchObject({ id: id(81), date: MON, version: 1 });
    const body = String(monday.body.bodyMarkdown);
    expect(body.startsWith('## Carried in\n\n')).toBe(true);
    expect(
      body.endsWith(
        fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
          area: 'work',
          date: MON,
        }),
      ),
    ).toBe(true);
    expect(new Set(taskEmbedIds(body))).toEqual(new Set([id(1), id(6)]));
    expect(monday.body.taskIds).toHaveLength(2);
  });

  it('opening again, or on two devices at once, inserts the block once', async () => {
    await task(1);
    await task(6, { startDate: '2026-10-01' });

    const [phone, desktop] = await Promise.all([
      open(MON, id(81)),
      open(MON, id(82)),
    ]);
    expect(phone.status).toBe(200);
    expect(desktop.status).toBe(200);
    expect(phone.body.id).toBe(desktop.body.id);
    expect(desktop.body.bodyMarkdown).toBe(phone.body.bodyMarkdown);

    const again = await open(MON, id(83));
    expect(again.body).toMatchObject({
      id: phone.body.id,
      version: 1,
      bodyMarkdown: phone.body.bodyMarkdown,
    });
    expect(
      String(again.body.bodyMarkdown).match(/## Carried in/g),
    ).toHaveLength(1);
    expect(await dailyClaims()).toBe(1);
  });

  it('leaves an existing note alone and creates nothing when nothing is open', async () => {
    const empty = await open(MON, id(81));
    expect(empty.body).toMatchObject({
      exists: false,
      date: MON,
      templateMarkdown: fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        area: 'work',
        date: MON,
      }),
    });
    expect(await dailyClaims()).toBe(0);

    await call('PUT', `/api/notebook/notes/daily/work/${MON}`, {
      id: id(82),
      bodyMarkdown: 'Standup',
    });
    await task(1);
    const existing = await open(MON, id(83));
    expect(existing.body).toMatchObject({
      id: id(82),
      bodyMarkdown: 'Standup',
      version: 1,
    });
  });
});

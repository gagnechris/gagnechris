import { describe, expect, it } from 'vitest';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  addMovedTaskBlock,
  DEFAULT_DAILY_TEMPLATES,
  fillDailyTemplate,
  taskEmbedIds,
} from '@gagnechris/shared';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-carry-in';
const FRI = '2026-10-02';
const MON = '2026-10-05';
const id = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5H${String(n).padStart(2, '0')}`;

const embedLines = (markdown: string) =>
  taskEmbedIds(markdown)
    .map((taskId) => `{{task:${taskId}}}`)
    .join('\n');

describe('opening a daily note carries in open tasks', () => {
  const h = useApi('carry-in');
  const { call } = apiCalls(h, { user: USER });

  const task = (n: number, fields: Record<string, unknown> = {}) =>
    call('POST', '/api/notebook/tasks', {
      body: {
        id: id(n),
        area: 'work',
        title: `Task ${n}`,
        ...fields,
      },
    });

  const open = (date: string, noteId: string, area = 'work') =>
    call('POST', `/api/notebook/notes/daily/${area}/${date}/open`, {
      body: {
        id: noteId,
      },
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
      {
        body: {
          id: id(80),
          bodyMarkdown: `{{task:${id(1)}}}\n{{task:${id(2)}}}`,
        },
      },
    );
    expect(fridayNote.status).toBe(200);

    const monday = await open(MON, id(81));
    expect(monday.status).toBe(200);
    expect(monday.body).toMatchObject({ id: id(81), date: MON, version: 1 });
    const body = String(monday.body.bodyMarkdown);
    expect(body).toBe(
      fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        areaName: 'Work',
        date: MON,
      }).replace(
        '## Focus for Monday\n- \n\n',
        `## Focus for Monday\n${embedLines(body)}\n\n`,
      ),
    );
    expect(body).not.toContain('Carried in');
    expect(new Set(taskEmbedIds(body))).toEqual(new Set([id(1), id(6)]));
    expect(monday.body.taskIds).toHaveLength(2);
  });

  it('carries into Plans with the default Personal template', async () => {
    await task(7, { area: 'personal' });
    const monday = await open(MON, id(81), 'personal');
    expect(monday.body.bodyMarkdown).toBe(
      DEFAULT_DAILY_TEMPLATES.personal.replace(
        '## Plans\n- \n\n',
        `## Plans\n{{task:${id(7)}}}\n\n`,
      ),
    );
  });

  it('carries into the section the template names, nesting subtasks', async () => {
    const friday = `/api/notebook/notes/daily/work/${FRI}`;
    await call('PUT', friday, { body: { id: id(80), bodyMarkdown: '' } });
    await task(1, { noteId: id(80) });
    await task(2, { noteId: id(80) });
    const nested = await call('PUT', friday, {
      body: {
        id: id(80),
        version: 1,
        bodyMarkdown: `{{task:${id(1)}}}\n  {{task:${id(2)}}}`,
      },
    });
    expect(nested.status).toBe(200);
    const template = await call('PUT', '/api/notebook/templates/daily/work', {
      body: {
        version: 0,
        bodyMarkdown:
          '## Focus for {{weekday}}\n- \n\n## Meetings\nnone yet\n\n## Notes\n',
        carryOverSection: 'Meetings',
      },
    });
    expect(template.status).toBe(200);

    const monday = await open(MON, id(81));
    expect(monday.body.bodyMarkdown).toBe(
      `## Focus for Monday\n- \n\n## Meetings\nnone yet\n\n{{task:${id(1)}}}\n  {{task:${id(2)}}}\n\n## Notes\n`,
    );
  });

  it('adds a Carried in section when the template has no heading or is blank', async () => {
    await task(1);
    await task(7, { area: 'personal' });
    for (const [area, bodyMarkdown] of [
      ['work', 'Just a line\n'],
      ['personal', ''],
    ] as const) {
      const saved = await call('PUT', `/api/notebook/templates/daily/${area}`, {
        body: { version: 0, bodyMarkdown },
      });
      expect(saved.status).toBe(200);
    }

    expect((await open(MON, id(81))).body.bodyMarkdown).toBe(
      `## Carried in\n\n{{task:${id(1)}}}\n\nJust a line\n`,
    );
    expect((await open(MON, id(82), 'personal')).body.bodyMarkdown).toBe(
      `## Carried in\n\n{{task:${id(7)}}}\n\n`,
    );
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
    expect(String(again.body.bodyMarkdown).match(/\{\{task:/g)).toHaveLength(2);
    expect(await dailyClaims()).toBe(1);
  });

  it('creates nothing when nothing is open, and leaves a note it made alone', async () => {
    const empty = await open(MON, id(81));
    expect(empty.body).toMatchObject({
      exists: false,
      date: MON,
      templateMarkdown: fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
        areaName: 'Work',
        date: MON,
      }),
    });
    expect(await dailyClaims()).toBe(0);

    await task(1);
    const first = await open(MON, id(82));
    expect(first.body).toMatchObject({ id: id(82), version: 1 });
    await task(6, { startDate: '2026-10-01' });
    const again = await open(MON, id(83));
    expect(again.body).toMatchObject({
      id: id(82),
      version: 1,
      bodyMarkdown: first.body.bodyMarkdown,
    });
  });

  const mondayTemplate = fillDailyTemplate(DEFAULT_DAILY_TEMPLATES.work, {
    areaName: 'Work',
    date: MON,
  });
  // What moving task 9 to Monday writes: the day's template, then the
  // task's block, here with task 6 under it.
  const movedToMonday = addMovedTaskBlock(
    mondayTemplate,
    id(9),
    `{{task:${id(9)}}}\n  {{task:${id(6)}}}`,
  )!;
  const moveToMonday = () =>
    call('PUT', `/api/notebook/notes/daily/work/${MON}`, {
      body: { id: id(80), bodyMarkdown: movedToMonday },
    });

  it('a day a task was moved to carries in on its first open', async () => {
    await task(1);
    await task(6, { startDate: '2026-10-01' });
    await task(9, { startDate: MON });
    expect((await moveToMonday()).status).toBe(200);
    const edited = movedToMonday + 'Agenda\n';
    const edit = await call('PUT', `/api/notebook/notes/daily/work/${MON}`, {
      body: { id: id(80), version: 1, bodyMarkdown: edited },
    });
    expect(edit.status).toBe(200);

    const monday = await open(MON, id(81));
    expect(monday.status).toBe(200);
    const carried = edited.replace(
      '## Focus for Monday\n- \n\n',
      `## Focus for Monday\n{{task:${id(1)}}}\n\n`,
    );
    expect(monday.body).toMatchObject({
      id: id(80),
      version: 3,
      bodyMarkdown: carried,
    });
    expect(new Set(monday.body.taskIds as string[])).toEqual(
      new Set([id(1), id(6), id(9)]),
    );

    await task(2);
    const again = await open(MON, id(82));
    expect(again.body).toMatchObject({
      id: id(80),
      version: 3,
      bodyMarkdown: carried,
    });
  });

  it('carries into the template section by its filled heading', async () => {
    await task(1);
    const template = await call('PUT', '/api/notebook/templates/daily/work', {
      body: {
        version: 0,
        bodyMarkdown: '## Notes\n- \n\n## Focus for {{weekday}}\n- \n',
        carryOverSection: 'Focus for {{weekday}}',
      },
    });
    expect(template.status).toBe(200);
    await call('PUT', `/api/notebook/notes/daily/work/${MON}`, {
      body: {
        id: id(80),
        bodyMarkdown: `## Notes\n- \n\n## Focus for Monday\n- \n`,
      },
    });

    expect((await open(MON, id(81))).body.bodyMarkdown).toBe(
      `## Notes\n- \n\n## Focus for Monday\n{{task:${id(1)}}}\n`,
    );
  });

  it('two devices opening a day a task was moved to carry in once', async () => {
    await task(1);
    await task(6, { startDate: '2026-10-01' });
    await task(9, { startDate: MON });
    expect((await moveToMonday()).status).toBe(200);

    const [phone, desktop] = await Promise.all([
      open(MON, id(81)),
      open(MON, id(82)),
    ]);
    expect(phone.status).toBe(200);
    expect(desktop.status).toBe(200);
    expect(desktop.body).toMatchObject({
      id: id(80),
      version: 2,
      bodyMarkdown: phone.body.bodyMarkdown,
    });
    expect(String(phone.body.bodyMarkdown).match(/\{\{task:/g)).toHaveLength(3);
  });

  it('a note made before the day with nothing to carry is left alone after its first open', async () => {
    await call('PUT', `/api/notebook/notes/daily/work/${MON}`, {
      body: { id: id(82), bodyMarkdown: 'Standup' },
    });
    const first = await open(MON, id(83));
    expect(first.body).toMatchObject({
      id: id(82),
      bodyMarkdown: 'Standup',
      version: 1,
    });

    await task(1);
    const existing = await open(MON, id(84));
    expect(existing.body).toMatchObject({
      id: id(82),
      bodyMarkdown: 'Standup',
      version: 1,
    });
  });

  it('carries tasks in the order the previous day listed them', async () => {
    await task(1);
    await task(2);
    await task(3);
    await task(4);
    await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
      body: {
        id: id(85),
        bodyMarkdown: `## Focus\n{{task:${id(3)}}}\n{{task:${id(1)}}}\n{{task:${id(2)}}}`,
      },
    });

    const monday = await open(MON, id(86));
    expect(taskEmbedIds(String(monday.body.bodyMarkdown))).toEqual([
      id(3),
      id(1),
      id(2),
      id(4),
    ]);
  });

  describe('a carried task taken out of a day', () => {
    const TUE = '2026-10-06';
    const WED = '2026-10-07';

    async function carriedThenRemoved() {
      await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
        body: { id: id(80), bodyMarkdown: 'Standup' },
      });
      await task(1, { startDate: FRI, noteId: id(80) });
      await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
        body: { id: id(80), version: 1, bodyMarkdown: `{{task:${id(1)}}}` },
      });
      const monday = await open(MON, id(81));
      expect(taskEmbedIds(String(monday.body.bodyMarkdown))).toEqual([id(1)]);
      const removed = await call(
        'PUT',
        `/api/notebook/notes/daily/work/${MON}`,
        {
          body: {
            id: id(81),
            version: monday.body.version,
            bodyMarkdown: 'Standup',
          },
        },
      );
      expect(removed.status).toBe(200);
    }

    it('is not carried into later days, and stays open in its own note', async () => {
      await carriedThenRemoved();

      const tuesday = await open(TUE, id(82));
      expect(tuesday.body.exists).toBe(false);
      const t = await call('GET', `/api/notebook/tasks/${id(1)}`);
      expect(t.body).toMatchObject({ status: 'todo', noteId: id(80) });
      expect(t.body).not.toHaveProperty('carryStopped');
    });

    it('carries again once it is rescheduled', async () => {
      await carriedThenRemoved();
      const t = await call('GET', `/api/notebook/tasks/${id(1)}`);
      const moved = await call('PUT', `/api/notebook/tasks/${id(1)}`, {
        body: { version: t.body.version, startDate: MON },
      });
      expect(moved.status).toBe(200);

      const tuesday = await open(TUE, id(82));
      expect(taskEmbedIds(String(tuesday.body.bodyMarkdown))).toEqual([id(1)]);
    });

    it('carries again once a day embeds it again', async () => {
      await carriedThenRemoved();
      await call('PUT', `/api/notebook/notes/daily/work/${TUE}`, {
        body: { id: id(82), bodyMarkdown: `{{task:${id(1)}}}` },
      });

      const wednesday = await open(WED, id(83));
      expect(taskEmbedIds(String(wednesday.body.bodyMarkdown))).toEqual([
        id(1),
      ]);
    });

    it('a task taken out of its own note still carries', async () => {
      await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
        body: { id: id(80), bodyMarkdown: 'Standup' },
      });
      await task(1, { startDate: FRI, noteId: id(80) });
      await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
        body: { id: id(80), version: 1, bodyMarkdown: `{{task:${id(1)}}}` },
      });
      await call('PUT', `/api/notebook/notes/daily/work/${FRI}`, {
        body: { id: id(80), version: 2, bodyMarkdown: 'Standup' },
      });

      const monday = await open(MON, id(81));
      expect(taskEmbedIds(String(monday.body.bodyMarkdown))).toEqual([id(1)]);
    });
  });
});

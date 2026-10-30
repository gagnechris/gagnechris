import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { WEEKLY_RECAP_PENDING_MARKDOWN } from '@gagnechris/shared';
import { NOTEBOOK_RECAPS_PER_USER_PER_DAY } from '@gagnechris/shared/server';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-weekly-recap';
const MON = '2026-10-26';
const PATH = '/api/notebook/recaps/weekly';

const h = useApi('weekly-recap');
const { call, ok } = apiCalls(h, { user: USER });

async function settled(noteId: string, user = USER) {
  for (let i = 0; i < 100; i++) {
    const note = await ok('GET', `/api/notebook/notes/${noteId}`, { user });
    if (note.bodyMarkdown !== WEEKLY_RECAP_PENDING_MARKDOWN) return note;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`recap ${noteId} was never written`);
}

describe('weekly recaps over HTTP (DynamoDB Local)', () => {
  it('creates a recap note and writes the area’s week into it', async () => {
    const shipped = ulid();
    const open = ulid();
    await ok('POST', '/api/notebook/tasks', {
      body: { id: shipped, area: 'work', title: 'Ship the export' },
    });
    await ok('POST', '/api/notebook/tasks', {
      body: {
        id: open,
        area: 'work',
        title: 'Renew passport',
        dueDate: '2026-10-28',
      },
    });
    await ok('PUT', `/api/notebook/notes/daily/work/2026-10-27`, {
      body: {
        id: ulid(),
        bodyMarkdown: `## Focus\n{{task:${shipped}}}\n{{task:${open}}}\nPairing went well.`,
      },
    });
    await ok('POST', `/api/notebook/tasks/${shipped}/complete`, {
      ifMatch: '*',
    });
    await ok('PUT', `/api/notebook/notes/daily/work/2026-11-02`, {
      body: { id: ulid(), bodyMarkdown: 'Next week already.' },
    });
    await ok('PUT', `/api/notebook/notes/daily/personal/2026-10-27`, {
      body: { id: ulid(), bodyMarkdown: 'Dentist.' },
    });

    const id = ulid();
    const created = await call('POST', PATH, {
      body: { id, area: 'work', weekStart: MON },
    });
    expect(created.status).toBe(201);
    expect(created.etag).toBe('"1"');
    expect(created.body).toMatchObject({
      id,
      area: 'work',
      type: 'page',
      date: null,
      title: 'Week of Oct 26, 2026',
      tags: ['recap'],
      taskIds: [],
    });

    const note = await settled(id);
    expect(note.version).toBe(2);
    expect(note.taskIds).toEqual([]);
    expect(note.bodyMarkdown).toContain('Written on the local stack');
    expect(note.bodyMarkdown).toContain('Area: Work');
    expect(note.bodyMarkdown).toContain(
      'This week: Monday, Oct 26 to Sunday, Nov 1',
    );
    expect(note.bodyMarkdown).toContain('Pairing went well.');
    expect(note.bodyMarkdown).toMatch(
      /\[done \d{4}-\d{2}-\d{2}; .*\] Ship the export/,
    );
    expect(note.bodyMarkdown).toContain(
      'due 2026-10-28 (overdue by the end of the week)',
    );
    expect(note.bodyMarkdown).not.toContain('Next week already.');
    expect(note.bodyMarkdown).not.toContain('Dentist.');
    expect(note.bodyMarkdown).not.toContain('{{task:');

    const again = await call('POST', PATH, {
      body: { id, area: 'work', weekStart: MON },
    });
    expect(again.status).toBe(201);
    expect(again.body.version).toBe(2);
  });

  it('turns away a week that does not start on Monday, and unknown areas', async () => {
    const tuesday = await call('POST', PATH, {
      body: { id: ulid(), area: 'work', weekStart: '2026-10-27' },
    });
    expect(tuesday.status).toBe(400);
    expect(tuesday.body.fields).toEqual({ weekStart: 'custom' });

    const nowhere = await call('POST', PATH, {
      body: { id: ulid(), area: 'garden', weekStart: MON },
    });
    expect(nowhere.status).toBe(400);
  });

  it(`allows ${NOTEBOOK_RECAPS_PER_USER_PER_DAY} recaps a day per user`, async () => {
    const recap = (user: string) =>
      call('POST', PATH, {
        user,
        body: { id: ulid(), area: 'personal', weekStart: MON },
      });
    const ids: string[] = [];
    for (let i = 0; i < NOTEBOOK_RECAPS_PER_USER_PER_DAY; i++) {
      const res = await recap('busy-recapper');
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    const over = await recap('busy-recapper');
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('rate_limited');
    expect((await recap('calm-recapper')).status).toBe(201);
    for (const id of ids) await settled(id, 'busy-recapper');
  });

  it('is a Notebook route', async () => {
    const res = await h.api.request('POST', PATH, {
      body: { id: ulid(), area: 'work', weekStart: MON },
    });
    expect(res.status).toBe(401);
  });
});

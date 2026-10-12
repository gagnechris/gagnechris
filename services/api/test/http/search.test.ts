import { describe, expect, it } from 'vitest';
import {
  NOTEBOOK_SEARCH_LIMIT_MAX,
  NOTEBOOK_SEARCH_MAX_LENGTH,
} from '@gagnechris/shared';
import { ulid } from 'ulid';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-search-http';
const OTHER = 'user-search-http-other';

type Hit = {
  type: 'note' | 'task';
  id: string;
  area: string;
  title: string;
  date?: string;
  status?: string;
  version?: number;
  snippet: string;
  matches: { start: number; end: number }[];
};
type Results = { notes: Hit[]; tasks: Hit[] };
type Entity = { id: string; version: number; [key: string]: unknown };

const h = useApi('search-http');

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string>; user?: string } = {},
) {
  const res = await h.api.request(method, `/api${path}`, {
    body: opts.body,
    query: opts.query,
    claims: notebookUser(opts.user ?? USER),
  });
  return { status: res.status, headers: res.headers, body: res.body };
}

async function ok(
  method: string,
  path: string,
  opts?: Parameters<typeof call>[2],
): Promise<Entity> {
  const res = await call(method, path, opts);
  expect(
    res.status,
    `${method} ${path}: ${JSON.stringify(res.body)}`,
  ).toBeLessThan(300);
  return res.body as Entity;
}

const note = (over: Record<string, unknown>, user = USER) =>
  ok('POST', '/notebook/notes', {
    body: { id: ulid(), area: 'work', type: 'page', ...over },
    user,
  });

const task = (over: Record<string, unknown>, id = ulid()) =>
  ok('POST', '/notebook/tasks', {
    body: { id, area: 'work', title: 'Task', ...over },
  });

const search = async (body: Record<string, unknown>) => {
  const res = await call('POST', '/notebook/search', { body });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as Results;
};

describe('POST /api/notebook/search', () => {
  it('ranks title, then tags, then body, with a bonus for a leading or word-start match', async () => {
    const reship = await note({
      title: 'Reship plan',
      bodyMarkdown: '## Dates\n\nShip it **Friday**.',
    });
    const ship = await note({ title: 'Ship plan' });
    const body = await note({ title: 'Notes', bodyMarkdown: 'we ship' });
    const tagged = await note({ title: 'Tagged', tags: ['shipping', 'x'] });
    await note({ title: 'Unrelated' }, OTHER);
    await note({ title: 'Ship it' }, OTHER);

    const { notes, tasks } = await search({ q: '  SHIP ' });
    expect(tasks).toEqual([]);
    expect(notes).toEqual([
      {
        type: 'note',
        id: ship.id,
        area: 'work',
        title: 'Ship plan',
        snippet: '',
        matches: [],
      },
      {
        type: 'note',
        id: reship.id,
        area: 'work',
        title: 'Reship plan',
        snippet: 'Dates Ship it Friday.',
        matches: [{ start: 6, end: 10 }],
      },
      {
        type: 'note',
        id: tagged.id,
        area: 'work',
        title: 'Tagged',
        snippet: 'shipping x',
        matches: [{ start: 0, end: 4 }],
      },
      {
        type: 'note',
        id: body.id,
        area: 'work',
        title: 'Notes',
        snippet: 'we ship',
        matches: [{ start: 3, end: 7 }],
      },
    ]);
    expect(
      (await search({ q: 'ship', limit: 2 })).notes.map((n) => n.id),
    ).toEqual([ship.id, reship.id]);
  });

  it('cuts a snippet around the first match, collapsing whitespace, in UTF-16 offsets, or from the body start for a title hit', async () => {
    const long = await note({
      title: 'Long',
      bodyMarkdown: `${'x'.repeat(100)} Ship   it\n\nnow ${'y'.repeat(100)}`,
    });
    const emoji = await note({
      title: '🚀 Launch day',
      bodyMarkdown: `- [ ] ${'Book the hall. '.repeat(10)}`,
    });
    const split = await note({
      title: 'Split',
      bodyMarkdown: `rocket!${'😀'.repeat(40)}`,
    });

    expect(
      (await search({ q: 'ship' })).notes.find((n) => n.id === long.id),
    ).toMatchObject({
      snippet: `…${'x'.repeat(59)} Ship it now ${'y'.repeat(49)}…`,
      matches: [{ start: 61, end: 65 }],
    });
    expect((await search({ q: 'launch' })).notes).toEqual([
      expect.objectContaining({
        id: emoji.id,
        snippet: `${'Book the hall. '.repeat(8).trimEnd()}…`,
        matches: [],
      }),
    ]);
    // The cut lands inside an emoji, leaving half of it, as JSON.stringify writes it.
    expect((await search({ q: 'rocket' })).notes).toEqual([
      expect.objectContaining({
        id: split.id,
        snippet: `rocket!${'😀'.repeat(40)}`.slice(0, 66) + '…',
        matches: [{ start: 0, end: 6 }],
      }),
    ]);
  });

  it('reads markdown and embedded tasks as plain text, and daily notes by their day', async () => {
    const done = await task({ title: 'Call Sam', status: 'done' });
    const dropped = await task({ title: 'Email Sam', status: 'dropped' });
    const gone = await task({ title: 'Text Sam' });
    await ok('DELETE', `/notebook/tasks/${gone.id}`, {
      body: { version: 1 },
    });
    const standup = await note({
      title: 'Standup',
      bodyMarkdown: [
        'Follow up',
        `  {{task:${done.id.toLowerCase()}}}\r`,
        `{{task:${dropped.id}}}`,
        `{{task:${gone.id}}}`,
      ].join('\n'),
    });
    const fenced = await note({
      title: 'Code',
      bodyMarkdown: ['```', `{{task:${done.id}}}`, '```'].join('\n'),
    });
    const daily = await ok('PUT', '/notebook/notes/daily/personal/2026-09-19', {
      body: { id: ulid(), bodyMarkdown: 'garden beds' },
    });

    const sam = await search({ q: 'sam' });
    expect(sam.notes).toEqual([
      expect.objectContaining({
        id: standup.id,
        snippet: 'Follow up Call Sam Email Sam (dropped)',
        matches: [{ start: 15, end: 18 }],
      }),
    ]);
    expect((await search({ q: '{{task:' })).notes).toEqual([
      expect.objectContaining({
        id: fenced.id,
        snippet: `{{task:${done.id}}}`,
      }),
    ]);
    expect(sam.tasks.map((t) => [t.id, t.status, t.version])).toEqual([
      [done.id, 'done', 1],
      [dropped.id, 'dropped', 1],
    ]);
    expect((await search({ q: 'text sam' })).notes).toEqual([]);

    expect((await search({ q: 'saturday' })).notes).toEqual([
      {
        type: 'note',
        id: daily.id,
        area: 'personal',
        title: 'Saturday, Sep 19',
        date: '2026-09-19',
        snippet: 'garden beds',
        matches: [],
      },
    ]);
    expect((await search({ q: 'garden', area: 'work' })).notes).toEqual([]);
    expect(
      (await search({ q: 'garden', area: 'personal' })).notes.map((n) => n.id),
    ).toEqual([daily.id]);
  });

  it('task hits carry status and version, with the description and tags searched', async () => {
    const t = await task({
      title: 'Plan',
      description: 'Book the venue',
      tags: ['offsite'],
      priority: 'high',
    });
    expect(await search({ q: 'venue' })).toEqual({
      notes: [],
      tasks: [
        {
          type: 'task',
          id: t.id,
          area: 'work',
          title: 'Plan',
          status: 'todo',
          version: 1,
          snippet: 'Book the venue',
          matches: [{ start: 9, end: 14 }],
        },
      ],
    });
    expect((await search({ q: 'offsite' })).tasks[0]?.snippet).toBe('offsite');
  });

  it('breaks ties in list order: notes by key, tasks by each sorted page of 100', async () => {
    const taskIds = Array.from({ length: 130 }, () => ulid()).sort();
    for (let i = taskIds.length; i > 0; i -= 10) {
      await Promise.all(
        taskIds
          .slice(Math.max(0, i - 10), i)
          .map((id) => task({ title: 'Same thing' }, id)),
      );
    }
    for (let i = 0; i < 6; i++) {
      await note({ title: `Same ${i}`, area: i % 2 ? 'work' : 'personal' });
    }

    const firstPage = await ok('GET', '/notebook/tasks', {
      query: { area: 'work', status: 'todo', limit: '100' },
    });
    const notes: Entity[] = [];
    let cursor: string | undefined;
    do {
      const page = await ok('GET', '/notebook/notes', {
        query: { limit: '4', ...(cursor ? { cursor } : {}) },
      });
      notes.push(...(page.items as Entity[]));
      cursor = page.nextCursor as string | undefined;
    } while (cursor);

    const found = await search({ q: 'same', limit: NOTEBOOK_SEARCH_LIMIT_MAX });
    expect(found.tasks.map((t) => t.id)).toEqual(
      (firstPage.items as Entity[])
        .slice(0, NOTEBOOK_SEARCH_LIMIT_MAX)
        .map((t) => t.id),
    );
    expect(found.notes.map((n) => n.id)).toEqual(notes.map((n) => n.id));
  });

  it.each([
    [
      { q: '', limit: NOTEBOOK_SEARCH_LIMIT_MAX + 1 },
      { q: 'too_small', limit: 'too_big' },
    ],
    [{ q: '   ' }, { q: 'too_small' }],
    [{ q: 'x'.repeat(NOTEBOOK_SEARCH_MAX_LENGTH + 1) }, { q: 'too_big' }],
    [
      { q: 5, area: 'home', limit: 1.5 },
      { q: 'invalid_type', area: 'invalid_value', limit: 'invalid_type' },
    ],
    [{ q: 'x', limit: 0 }, { limit: 'too_small' }],
  ])('rejects %j', async (body, fields) => {
    const res = await call('POST', '/notebook/search', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
  });

  it('is POST only, so terms never sit in a URL', async () => {
    const res = await call('GET', '/notebook/search', { query: { q: 'ship' } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

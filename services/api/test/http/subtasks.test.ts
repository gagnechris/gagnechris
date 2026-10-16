import { describe, expect, it } from 'vitest';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-subtasks';
const id = (n: number) =>
  `01ARZ3NDEKTSV4RRFFQ69G5S${String(n).padStart(2, '0')}`;
const t = (n: number) => `{{task:${id(n)}}}`;

type Task = { id: string; parentId: string | null; version: number };
type Note = { id: string; version: number };

describe('subtasks come from indentation in the home note', () => {
  const h = useApi('subtasks');
  const { call, ok } = apiCalls(h, { user: USER });

  const page = (n: number, area = 'work') =>
    ok<Note>('POST', '/api/notebook/notes', {
      body: { id: id(n), area, type: 'page', title: `Page ${n}` },
    });
  const task = (n: number, noteId: string | null, area = 'work') =>
    ok<Task>('POST', '/api/notebook/tasks', {
      body: { id: id(n), area, title: `Task ${n}`, noteId },
    });
  const write = (note: Note, lines: string[]) =>
    ok<Note>('PUT', `/api/notebook/notes/${note.id}`, {
      body: { version: note.version, bodyMarkdown: lines.join('\n') },
    });
  const parentOf = async (n: number) =>
    (await ok<Task>('GET', `/api/notebook/tasks/${id(n)}`)).parentId;

  it('sets the parent when a task is indented under another, one level deep, and clears it when un-indented', async () => {
    let note = await page(90);
    for (const n of [1, 2, 3, 4]) await task(n, note.id);

    note = await write(note, [t(1), `  ${t(2)}`, `    ${t(3)}`, t(4)]);
    expect(await parentOf(2)).toBe(id(1));
    expect(await parentOf(3)).toBeNull();
    expect(await parentOf(1)).toBeNull();
    expect(await parentOf(4)).toBeNull();

    note = await write(note, [t(1), t(2), `  ${t(3)}`, t(4)]);
    expect(await parentOf(2)).toBeNull();
    expect(await parentOf(3)).toBe(id(2));

    const listed = await ok<{ items: Task[] }>('GET', '/api/notebook/tasks', {
      query: { noteId: note.id },
    });
    expect(
      Object.fromEntries(listed.items.map((x) => [x.id, x.parentId])),
    ).toEqual({ [id(1)]: null, [id(2)]: null, [id(3)]: id(2), [id(4)]: null });
  });

  it('ignores indentation outside the home note and across areas', async () => {
    const home = await page(91);
    const other = await page(92);
    await task(10, home.id);
    await task(11, home.id);
    await task(12, home.id, 'personal');
    await write(home, [t(10), t(11), `  ${t(12)}`]);
    await write(other, [t(10), `  ${t(11)}`]);
    expect(await parentOf(11)).toBeNull();
    expect(await parentOf(12)).toBeNull();
  });

  it('moving a task to another note takes its parent from that note', async () => {
    const from = await page(93);
    let to = await page(94);
    await task(20, from.id);
    await task(21, from.id);
    to = await write(to, [t(20), `  ${t(21)}`]);
    expect(await parentOf(21)).toBeNull();

    const moved = await ok<Task>('PUT', `/api/notebook/tasks/${id(21)}`, {
      body: { version: 1, noteId: to.id },
    });
    expect(moved.parentId).toBe(id(20));
  });

  it('never nests under a subtask, so two notes cannot make a cycle or a chain', async () => {
    const one = await page(80);
    const two = await page(81);
    await task(60, one.id);
    await task(61, two.id);
    await task(62, two.id);
    await write(one, [t(61), `  ${t(60)}`]);
    expect(await parentOf(60)).toBe(id(61));

    await write(two, [t(60), `  ${t(61)}`, `  ${t(62)}`]);
    expect(await parentOf(61)).toBeNull();
    expect(await parentOf(62)).toBeNull();
    expect(await parentOf(60)).toBe(id(61));
  });

  it('a subtask loses a parent that moved to another area on the next note save, and gets it back by following it', async () => {
    let note = await page(82);
    await task(70, note.id);
    await task(71, note.id);
    note = await write(note, [t(70), `  ${t(71)}`]);
    expect(await parentOf(71)).toBe(id(70));

    await ok('PUT', `/api/notebook/tasks/${id(70)}`, {
      body: { version: 1, area: 'personal' },
    });
    await write(note, [t(70), `  ${t(71)}`, '']);
    expect(await parentOf(71)).toBeNull();

    const moved = await ok<Task>('PUT', `/api/notebook/tasks/${id(71)}`, {
      body: { version: 3, area: 'personal' },
    });
    expect(moved.parentId).toBe(id(70));
  });

  it('deleting a parent clears its subtasks', async () => {
    const note = await page(95);
    await task(30, note.id);
    await task(31, note.id);
    await task(32, note.id);
    await write(note, [t(30), `  ${t(31)}`, `  ${t(32)}`]);
    expect(await parentOf(31)).toBe(id(30));

    const deleted = await call('DELETE', `/api/notebook/tasks/${id(30)}`, {
      body: { version: 1 },
    });
    expect(deleted.status).toBe(200);
    expect(await parentOf(31)).toBeNull();
    expect(await parentOf(32)).toBeNull();
  });

  it('a new day carries in a parent with its open subtasks nested, and a subtask alone when its parent is done', async () => {
    const fri = await ok<Note>(
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-02',
      {
        body: { id: id(96), bodyMarkdown: '' },
      },
    );
    for (const n of [40, 41, 42, 43, 44]) await task(n, fri.id);
    await write(fri, [t(40), `  ${t(41)}`, `  ${t(42)}`, t(43), `  ${t(44)}`]);
    await ok('POST', `/api/notebook/tasks/${id(42)}/complete`, {
      body: { version: 2 },
    });
    await ok('POST', `/api/notebook/tasks/${id(43)}/complete`, {
      body: { version: 1 },
    });

    const mon = await ok<{ bodyMarkdown: string }>(
      'POST',
      '/api/notebook/notes/daily/work/2026-10-05/open',
      { body: { id: id(97) } },
    );
    expect(mon.bodyMarkdown).toContain(`${t(40)}\n  ${t(41)}\n`);
    expect(mon.bodyMarkdown).toMatch(
      new RegExp(`^${t(44).replace(/[{}]/g, '\\$&')}$`, 'm'),
    );
    expect(mon.bodyMarkdown).not.toContain(id(42));
    expect(mon.bodyMarkdown).not.toContain(id(43));
  });

  it('a new day nests carried tasks as the note of the day before did, wherever they were created', async () => {
    const fri = await ok<Note>(
      'PUT',
      '/api/notebook/notes/daily/work/2026-09-04',
      { body: { id: id(50), bodyMarkdown: '' } },
    );
    for (const n of [51, 52, 53, 54]) await task(n, fri.id);
    await write(fri, [t(51), t(52), t(53), `  ${t(54)}`]);
    expect(await parentOf(54)).toBe(id(53));

    const mon = await ok<Note>(
      'POST',
      '/api/notebook/notes/daily/work/2026-09-07/open',
      { body: { id: id(55) } },
    );
    await write(mon, [t(51), `  ${t(52)}`, t(53), t(54)]);
    expect(await parentOf(52)).toBeNull();

    const tue = await ok<{ bodyMarkdown: string }>(
      'POST',
      '/api/notebook/notes/daily/work/2026-09-08/open',
      { body: { id: id(56) } },
    );
    expect(tue.bodyMarkdown).toContain(
      `${t(51)}\n  ${t(52)}\n${t(53)}\n${t(54)}\n`,
    );
  });
});

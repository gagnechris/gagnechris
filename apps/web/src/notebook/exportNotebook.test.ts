import { afterEach, describe, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import type { Note, Task } from '@gagnechris/app-core';
import {
  buildNotebookExportZip,
  noteExportPath,
  noteToMarkdown,
  triggerBlobDownload,
} from './exportNotebook';

const note = (overrides: Partial<Note> = {}): Note => ({
  id: '01ARZ3NDEKTSV4RRFFQ48JMNO2',
  userId: 'u1',
  area: 'work',
  type: 'page',
  date: null,
  title: 'Hello World',
  bodyMarkdown: 'Body **here**',
  tags: ['a', 'b'],
  pinned: false,
  taskIds: [],
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('exportNotebook', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('renders markdown with frontmatter', () => {
    const md = noteToMarkdown(note());
    expect(md).toContain('id: "01ARZ3NDEKTSV4RRFFQ48JMNO2"');
    expect(md).toContain('title: "Hello World"');
    expect(md).toContain('Body **here**');
    expect(noteExportPath(note())).toMatch(/^notes\/pages\//);
  });

  test('frontmatter reads back as the same strings in a YAML parser', () => {
    const titles = [
      '[WIP] plan',
      '- todo',
      '*star',
      '@home',
      '%pct',
      '? q',
      '`tick`',
      '> quote',
      ',comma',
      '|pipe',
      'true',
      '2026',
      '0x1F',
      'null',
      '~',
      '&anchor',
      '{x}',
      'a: b # c',
      ' padded ',
      'line\nbreak',
      'quote " and \\',
      'Ünïcode 日本 🎉',
      '',
    ];
    for (const title of titles) {
      const md = noteToMarkdown(
        note({ title, type: 'daily', date: '2026-10-05', tags: ['yes', '1'] }),
      );
      const front = parse(md.split('---\n')[1]!) as Record<string, unknown>;
      expect(front, title).toEqual({
        id: '01ARZ3NDEKTSV4RRFFQ48JMNO2',
        area: 'work',
        type: 'daily',
        date: '2026-10-05',
        title,
        pinned: false,
        tags: ['yes', '1'],
        updatedAt: '2026-10-02T12:00:00.000Z',
      });
    }
  });

  test('keeps accents and non-Latin letters in file names', () => {
    expect(noteExportPath(note({ title: 'Ünïcode café 日本' }))).toBe(
      'notes/pages/01ARZ3ND-unicode-cafe-日本-8JMNO2.md',
    );
  });

  test('keeps the download URL alive after the click', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:x',
      revokeObjectURL: revoke,
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    triggerBlobDownload(new Blob(['x']), 'x.zip');
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  test('builds a zip blob with notes and tasks.json', async () => {
    const task: Task = {
      id: '01ARZ3NDEKTSV4RRFFQ48JMTC7',
      userId: 'u1',
      area: 'work',
      title: 'Ship export',
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: null,
      startDate: null,
      someday: false,
      completedAt: null,
      noteId: null,
      tags: [],
      version: 1,
      createdAt: '2026-10-02T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      deleted: false,
    };
    const { blob, fileCount } = buildNotebookExportZip([note()], [task]);
    expect(fileCount).toBeGreaterThanOrEqual(3);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(40);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Bit 11: names are UTF-8, so unzip tools keep non-Latin file names.
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    const central = buf.findIndex(
      (_, i) => view.getUint32(i, true) === 0x02014b50,
    );
    expect(view.getUint16(central + 8, true) & 0x0800).toBe(0x0800);
  });
  test('replaces task embeds with titles and checked state', async () => {
    const base: Task = {
      id: '01ARZ3NDEKTSV4RRFFQ48JMTC7',
      userId: 'u1',
      area: 'work',
      title: 'Call Sam',
      description: '',
      priority: 'med',
      status: 'done',
      dueDate: null,
      startDate: null,
      someday: false,
      completedAt: '2026-10-02T12:00:00.000Z',
      noteId: null,
      tags: [],
      version: 2,
      createdAt: '2026-10-02T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      deleted: false,
    };
    const open: Task = {
      ...base,
      id: '01ARZ3NDEKTSV4RRFFQ48JMTC8',
      title: 'Send invoice',
      status: 'todo',
      completedAt: null,
    };
    const dropped: Task = {
      ...open,
      id: '01ARZ3NDEKTSV4RRFFQ48JMTCA',
      title: 'Book venue',
      status: 'dropped',
    };
    const gone = '01ARZ3NDEKTSV4RRFFQ48JMTC9';
    const embedded = note({
      bodyMarkdown: `Standup\n{{task:${base.id}}}\n  {{task:${open.id}}}\n{{task:${dropped.id}}}\n{{task:${gone}}}`,
    });

    const { blob } = buildNotebookExportZip(
      [embedded],
      [base, open, dropped, { ...open, id: gone, deleted: true }],
    );
    const text = new TextDecoder().decode(await blob.arrayBuffer());
    expect(text).toContain(
      'Standup\n- [x] Call Sam\n  - [ ] Send invoice\n- [ ] ~~Book venue~~ (dropped)\n- [ ] (deleted task)\n',
    );
    expect(text).not.toContain('{{task:');
  });
});

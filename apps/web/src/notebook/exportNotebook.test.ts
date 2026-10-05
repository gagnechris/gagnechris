import { describe, expect, test } from 'vitest';
import type { Note, Task } from '@gagnechris/app-core';
import {
  buildNotebookExportZip,
  noteExportPath,
  noteToMarkdown,
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
  version: 1,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('exportNotebook', () => {
  test('renders markdown with frontmatter', () => {
    const md = noteToMarkdown(note());
    expect(md).toContain('id: 01ARZ3NDEKTSV4RRFFQ48JMNO2');
    expect(md).toContain('title: Hello World');
    expect(md).toContain('Body **here**');
    expect(noteExportPath(note())).toMatch(/^notes\/pages\//);
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
    // ZIP local file header signature
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});

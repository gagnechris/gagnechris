import { describe, expect, it } from 'vitest';
import {
  CreateNoteRequestSchema,
  CreateTaskRequestSchema,
  NoteSchema,
  SyncChangeSchema,
  TaskSchema,
} from './schemas.js';

const ts = '2026-10-02T12:00:00.000Z';
const ulid = '01ARZ3NDEKTSV4RRFFQ48JMCZC';

describe('Notebook schemas (CHR-39)', () => {
  it('accepts a daily note and rejects missing date', () => {
    const daily = NoteSchema.parse({
      id: ulid,
      userId: 'sub-1',
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: 'Today',
      bodyMarkdown: '- [ ] ship',
      tags: [],
      pinned: false,
      version: 1,
      createdAt: ts,
      updatedAt: ts,
      deleted: false,
    });
    expect(daily.date).toBe('2026-10-02');

    expect(() =>
      NoteSchema.parse({
        ...daily,
        date: null,
      }),
    ).toThrow(/Daily notes require date/);
  });

  it('accepts a page note and rejects a date on pages', () => {
    const page = NoteSchema.parse({
      id: ulid,
      userId: 'sub-1',
      area: 'personal',
      type: 'page',
      date: null,
      title: 'Ideas',
      bodyMarkdown: '',
      tags: ['inbox'],
      pinned: true,
      version: 0,
      createdAt: ts,
      updatedAt: ts,
      deleted: false,
    });
    expect(page.pinned).toBe(true);

    expect(() =>
      NoteSchema.parse({
        ...page,
        date: '2026-10-02',
      }),
    ).toThrow(/Page notes must not set date/);
  });

  it('normalizes create ULID and validates task enums', () => {
    const create = CreateNoteRequestSchema.parse({
      id: ulid.toLowerCase(),
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
    });
    expect(create.id).toBe(ulid.toUpperCase());
    expect(create.title).toBe('');

    const task = CreateTaskRequestSchema.parse({
      id: ulid,
      area: 'work',
      title: 'Ship CHR-39',
    });
    expect(task.priority).toBe('med');
    expect(task.status).toBe('todo');

    expect(
      TaskSchema.parse({
        id: ulid,
        userId: 'sub-1',
        area: 'work',
        title: 'Ship CHR-39',
        description: '',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-10-03',
        completedAt: null,
        noteId: null,
        tags: [],
        version: 2,
        createdAt: ts,
        updatedAt: ts,
        deleted: false,
      }).status,
    ).toBe('in_progress');
  });

  it('discriminates SyncChange note and task variants', () => {
    const noteChange = SyncChangeSchema.parse({
      type: 'note',
      id: ulid,
      version: 1,
      deleted: false,
      updatedAt: ts,
      entity: {
        id: ulid,
        userId: 'sub-1',
        area: 'work',
        type: 'daily',
        date: '2026-10-02',
        title: '',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
        version: 1,
        createdAt: ts,
        updatedAt: ts,
        deleted: false,
      },
    });
    expect(noteChange.type).toBe('note');

    const taskChange = SyncChangeSchema.parse({
      type: 'task',
      id: ulid,
      version: 1,
      deleted: true,
      updatedAt: ts,
    });
    expect(taskChange.type).toBe('task');
    expect(taskChange.entity).toBeUndefined();
  });
});

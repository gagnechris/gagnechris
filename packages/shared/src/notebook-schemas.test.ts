import { describe, expect, it } from 'vitest';
import {
  CreateNoteRequestSchema,
  CreateTaskRequestSchema,
  decodeSyncChangesResponse,
  ListTasksQuerySchema,
  NoteSchema,
  SYNC_CHANGE_TYPES,
  SyncChangeSchema,
  SyncChangesResponseSchema,
  TaskSchema,
  UpdateTaskRequestSchema,
} from './schemas.js';

const ts = '2026-10-02T12:00:00.000Z';
const ulid = '01ARZ3NDEKTSV4RRFFQ48JMCZC';

describe('Notebook schemas', () => {
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
      taskIds: [],
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
      taskIds: [],
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
      title: 'Ship it',
    });
    expect(task.priority).toBe('med');
    expect(task.status).toBe('todo');

    expect(
      TaskSchema.parse({
        id: ulid,
        userId: 'sub-1',
        area: 'work',
        title: 'Ship it',
        description: '',
        priority: 'high',
        status: 'in_progress',
        dueDate: '2026-10-03',
        startDate: '2026-10-03',
        someday: false,
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

  it('rejects a someday task with a startDate and conflicting start filters', () => {
    const base = { id: ulid, area: 'work', title: 'Ship it' };
    expect(
      CreateTaskRequestSchema.safeParse({
        ...base,
        someday: true,
        startDate: '2026-10-03',
      }).success,
    ).toBe(false);
    expect(
      CreateTaskRequestSchema.safeParse({ ...base, someday: true }).success,
    ).toBe(true);
    expect(
      UpdateTaskRequestSchema.safeParse({
        someday: true,
        startDate: '2026-10-03',
      }).success,
    ).toBe(false);
    expect(
      UpdateTaskRequestSchema.safeParse({ someday: true, startDate: null })
        .success,
    ).toBe(true);

    expect(
      ListTasksQuerySchema.safeParse({
        startOnOrBefore: '2026-10-03',
        startAfter: '2026-10-03',
      }).success,
    ).toBe(false);
    expect(
      ListTasksQuerySchema.safeParse({
        someday: 'true',
        startOnOrBefore: '2026-10-03',
      }).success,
    ).toBe(false);
    expect(
      ListTasksQuerySchema.parse({
        someday: 'false',
        startAfter: '2026-10-03',
      }),
    ).toMatchObject({ someday: false, startAfter: '2026-10-03' });
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
        taskIds: [],
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
    expect('entity' in taskChange).toBe(false);
  });

  it('lists only production change types (no fakeNote fixture)', () => {
    expect(SYNC_CHANGE_TYPES).toEqual(expect.arrayContaining(['note', 'task']));
    expect(SYNC_CHANGE_TYPES).not.toContain('fakeNote');
  });

  it('rejects a live change without entity', () => {
    const result = SyncChangeSchema.safeParse({
      type: 'task',
      id: ulid,
      version: 1,
      deleted: false,
      updatedAt: ts,
    });
    expect(result.success).toBe(false);
  });

  describe('decodeSyncChangesResponse', () => {
    const tombstone = (type: string) => ({
      type,
      id: ulid,
      version: 2,
      deleted: true,
      updatedAt: ts,
    });

    it('skips unknown change types and keeps the rest of the page', () => {
      const page = {
        changes: [
          tombstone('note'),
          { ...tombstone('calendarEvent'), entity: { anything: true } },
          tombstone('task'),
        ],
        nextCursor: 'abc',
        nextSince: ts,
      };
      expect(SyncChangesResponseSchema.safeParse(page).success).toBe(false);
      const decoded = decodeSyncChangesResponse(page);
      expect(decoded.changes.map((c) => c.type)).toEqual(['note', 'task']);
      expect(decoded.skippedTypes).toEqual(['calendarEvent']);
      expect(decoded.nextCursor).toBe('abc');
      expect(decoded.nextSince).toBe(ts);
    });

    it('still rejects a malformed change of a known type', () => {
      expect(() =>
        decodeSyncChangesResponse({
          changes: [{ ...tombstone('note'), deleted: false }],
          nextSince: ts,
        }),
      ).toThrow();
    });

    it('still rejects a malformed envelope', () => {
      expect(() => decodeSyncChangesResponse({ changes: [] })).toThrow();
    });
  });
});

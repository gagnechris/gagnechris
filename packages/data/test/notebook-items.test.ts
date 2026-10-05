import { describe, expect, it } from 'vitest';
import {
  buildDailyNoteClaimItem,
  buildNoteMetaItem,
  buildTaskMetaItem,
  metaToNote,
  metaToTask,
  noteContentEqual,
  parseDailyNoteClaimItem,
  parseNoteMetaItem,
  parseTaskMetaItem,
  taskContentEqual,
} from '../src/items.js';
import type { Note, Task } from '@gagnechris/shared';

const ts = '2026-10-02T12:00:00.000Z';

const dailyNote: Note = {
  id: '01ARZ3NDEKTSV4RRFFQ48JMCZC',
  userId: 'sub-1',
  area: 'work',
  type: 'daily',
  date: '2026-10-02',
  title: 'Today',
  bodyMarkdown: 'hello',
  tags: ['a', 'b'],
  pinned: false,
  version: 1,
  createdAt: ts,
  updatedAt: ts,
  deleted: false,
};

const pageNote: Note = {
  ...dailyNote,
  id: '01ARZ3NDEKTSV4RRFFQ48JMCZD',
  type: 'page',
  date: null,
  title: 'Page',
  pinned: true,
};

const task: Task = {
  id: '01ARZ3NDEKTSV4RRFFQ48JMCT0',
  userId: 'sub-1',
  area: 'personal',
  title: 'Buy milk',
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: '2026-10-03',
  startDate: '2026-10-03',
  someday: false,
  completedAt: null,
  noteId: dailyNote.id,
  tags: [],
  version: 0,
  createdAt: ts,
  updatedAt: ts,
  deleted: false,
};

describe('Notebook Dynamo items', () => {
  it('builds owner-scoped daily note META with DATE# GSI1', () => {
    const item = buildNoteMetaItem(dailyNote);
    expect(item.pk).toBe('USER#sub-1#NOTE#01ARZ3NDEKTSV4RRFFQ48JMCZC');
    expect(item.sk).toBe('META');
    expect(item.entityType).toBe('note');
    expect(item.gsi1pk).toBe('USER#sub-1#AREA#work');
    expect(item.gsi1sk).toBe('DATE#2026-10-02#NOTE#01ARZ3NDEKTSV4RRFFQ48JMCZC');
    expect(metaToNote(parseNoteMetaItem(item))).toEqual(dailyNote);
  });

  it('indexes pages under PAGE# and strips GSIs on delete', () => {
    const live = buildNoteMetaItem(pageNote);
    expect(live.gsi1sk?.startsWith('PAGE#')).toBe(true);

    const tombstone = buildNoteMetaItem({ ...pageNote, deleted: true });
    expect(tombstone.gsi1pk).toBeUndefined();
    expect(tombstone.gsi1sk).toBeUndefined();
  });

  it('builds daily claim and task META with START# / note GSI2', () => {
    const claim = buildDailyNoteClaimItem(
      'sub-1',
      'work',
      '2026-10-02',
      dailyNote.id,
    );
    expect(parseDailyNoteClaimItem(claim)).toEqual({
      pk: 'USER#sub-1#DAILY#work#2026-10-02',
      sk: 'NOTE',
      entityType: 'dailyNoteClaim',
      userId: 'sub-1',
      area: 'work',
      date: '2026-10-02',
      noteId: dailyNote.id,
    });

    const item = buildTaskMetaItem(task);
    expect(item.pk).toBe('USER#sub-1#TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0');
    expect(item.gsi1pk).toBe('USER#sub-1#AREA#personal#STATUS#todo');
    expect(item.gsi1sk).toBe(
      'START#2026-10-03#TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0',
    );
    expect(item.gsi2pk).toBe(
      'USER#sub-1#NOTE#01ARZ3NDEKTSV4RRFFQ48JMCZC#TASKS',
    );
    expect(item.gsi2sk).toBe('TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0');
    expect(metaToTask(parseTaskMetaItem(item))).toEqual(task);
  });

  it('uses UPDATED# for tasks with no startDate and omits GSI2 without noteId', () => {
    const undated = buildTaskMetaItem({
      ...task,
      startDate: null,
      noteId: null,
    });
    expect(undated.gsi1sk).toBe(
      `UPDATED#${ts}#TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0`,
    );
    expect(undated.gsi2pk).toBeUndefined();
  });

  it('keys someday tasks under SOMEDAY#, outside every start-date range', () => {
    const item = buildTaskMetaItem({ ...task, startDate: null, someday: true });
    expect(item.gsi1sk).toBe(`SOMEDAY#${ts}#TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0`);
    expect(metaToTask(parseTaskMetaItem(item)).someday).toBe(true);
  });

  it('reads a row stored without startDate as starting on its dueDate', () => {
    const { startDate: _s, someday: _d, ...legacy } = buildTaskMetaItem(task);
    legacy.gsi1sk = 'DUE#2026-10-03#TASK#01ARZ3NDEKTSV4RRFFQ48JMCT0';
    expect(metaToTask(parseTaskMetaItem(legacy))).toEqual(task);

    const undatedLegacy = { ...legacy, dueDate: null };
    expect(metaToTask(parseTaskMetaItem(undatedLegacy))).toMatchObject({
      startDate: null,
      someday: false,
    });

    const explicitNull = buildTaskMetaItem({ ...task, startDate: null });
    expect(metaToTask(parseTaskMetaItem(explicitNull)).startDate).toBeNull();
  });

  it('compares note/task content ignoring tag order via deepEqual', () => {
    expect(
      noteContentEqual(dailyNote, {
        ...dailyNote,
        tags: ['b', 'a'],
      }),
    ).toBe(false);
    expect(noteContentEqual(dailyNote, { ...dailyNote })).toBe(true);
    expect(taskContentEqual(task, { ...task, title: 'x' })).toBe(false);
    expect(taskContentEqual(task, { ...task, startDate: null })).toBe(false);
    expect(taskContentEqual(task, { ...task, someday: true })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTEBOOK_AREAS,
  notebookAreaIdFromName,
  notebookAreaName,
  resolveNotebookArea,
  UpdateNotebookAreasRequestSchema,
} from './notebook-area.js';
import {
  CreateTaskRequestSchema,
  NoteSchema,
  NotebookAreaSchema,
} from './schemas.js';

const areas = (...names: string[]) =>
  names.map((name) => ({ id: name.toLowerCase(), name }));

describe('NotebookAreaSchema', () => {
  it('accepts the existing work and personal ids and new slugs', () => {
    for (const id of ['work', 'personal', 'family', 'side-project', 'q4']) {
      expect(NotebookAreaSchema.safeParse(id).success).toBe(true);
    }
  });

  it('rejects ids that are not slugs or would break a key', () => {
    for (const id of [
      '',
      'all areas',
      'Work',
      'a#b',
      '-x',
      'x-',
      'a--b',
      'x'.repeat(25),
    ]) {
      expect(NotebookAreaSchema.safeParse(id).success, id).toBe(false);
    }
  });

  it('lets notes and tasks name an area outside the defaults', () => {
    expect(
      CreateTaskRequestSchema.safeParse({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        area: 'family',
        title: 'Book the cabin',
      }).success,
    ).toBe(true);
    expect(NoteSchema.shape.area.safeParse('family').success).toBe(true);
  });
});

describe('UpdateNotebookAreasRequestSchema', () => {
  it('takes one to four areas', () => {
    expect(
      UpdateNotebookAreasRequestSchema.safeParse({
        areas: areas('Work', 'Personal', 'Family', 'Health'),
      }).success,
    ).toBe(true);
    expect(
      UpdateNotebookAreasRequestSchema.safeParse({
        areas: areas('Work', 'Personal', 'Family', 'Health', 'Garden'),
      }).success,
    ).toBe(false);
    expect(
      UpdateNotebookAreasRequestSchema.safeParse({ areas: [] }).success,
    ).toBe(false);
  });

  it('rejects repeated ids and names, and blank or long names', () => {
    const issues = (list: { id: string; name: string }[]) =>
      UpdateNotebookAreasRequestSchema.safeParse({
        areas: list,
      }).error?.issues.map((i) => i.path.join('.'));
    expect(
      issues([
        { id: 'work', name: 'Work' },
        { id: 'work', name: 'Job' },
      ]),
    ).toEqual(['areas.1.id']);
    expect(
      issues([
        { id: 'work', name: 'Work' },
        { id: 'job', name: ' work ' },
      ]),
    ).toEqual(['areas.1.name']);
    expect(issues([{ id: 'work', name: '   ' }])).toEqual(['areas.0.name']);
    expect(issues([{ id: 'work', name: 'x'.repeat(31) }])).toEqual([
      'areas.0.name',
    ]);
  });
});

describe('notebookAreaIdFromName', () => {
  it('makes a slug the area schema accepts', () => {
    expect(notebookAreaIdFromName('Family', [])).toBe('family');
    expect(notebookAreaIdFromName('  Side  Project! ', [])).toBe(
      'side-project',
    );
    expect(notebookAreaIdFromName('Café Été', [])).toBe('cafe-ete');
    expect(notebookAreaIdFromName('★★', [])).toBe('area');
    const long = notebookAreaIdFromName('a very long name for an area ok', []);
    expect(NotebookAreaSchema.safeParse(long).success).toBe(true);
  });

  it('never reuses an id in the list', () => {
    expect(notebookAreaIdFromName('Work', ['work'])).toBe('work-2');
    expect(notebookAreaIdFromName('Work', ['work', 'work-2'])).toBe('work-3');
    const id = notebookAreaIdFromName('x'.repeat(30), ['x'.repeat(24)]);
    expect(id).toBe(`${'x'.repeat(22)}-2`);
  });
});

describe('resolveNotebookArea', () => {
  it('keeps a stored area that is still in the list', () => {
    expect(resolveNotebookArea('personal', DEFAULT_NOTEBOOK_AREAS)).toBe(
      'personal',
    );
  });

  it('falls back to the first area for All, a removed area or nothing', () => {
    const list = areas('Family', 'Work');
    expect(resolveNotebookArea('all', list)).toBe('family');
    expect(resolveNotebookArea('personal', list)).toBe('family');
    expect(resolveNotebookArea(null, list)).toBe('family');
  });
});

describe('notebookAreaName', () => {
  it('names an area, and shows an unknown id as itself', () => {
    expect(notebookAreaName(DEFAULT_NOTEBOOK_AREAS, 'work')).toBe('Work');
    expect(notebookAreaName(DEFAULT_NOTEBOOK_AREAS, 'family')).toBe('family');
  });
});

import * as z from 'zod';
import { describe, expect, it } from 'vitest';
import {
  CreatePostRequestSchema,
  CreateProjectRequestSchema,
  ExpectedVersionRequestSchema,
  HomeSchema,
  ListNotesQuerySchema,
  ListPostsQuerySchema,
  ListTasksQuerySchema,
  NoteSchema,
  PageLimitSchema,
  PublishableFieldsSchema,
  ResumeSchema,
  SyncChangesQuerySchema,
  TaskSchema,
  UpdateHomeRequestSchema,
  UpdateNoteRequestSchema,
  UpdatePostRequestSchema,
  UpdateProjectRequestSchema,
  UpdateResumeRequestSchema,
  UpdateTaskRequestSchema,
  UpsertDailyNoteRequestSchema,
  VersionSchema,
} from './schemas.js';

/** The field's own schema under any `.optional()` / `.default()` wrappers. */
const core = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
    current = current.unwrap() as z.ZodType;
  }
  return current;
};

describe('site entity request schemas', () => {
  it.each([
    ['post', CreatePostRequestSchema, UpdatePostRequestSchema],
    ['project', CreateProjectRequestSchema, UpdateProjectRequestSchema],
    ['home', HomeSchema, UpdateHomeRequestSchema],
    ['resume', ResumeSchema, UpdateResumeRequestSchema],
  ] as const)(
    'a %s update takes version first, then every input field optional, defined once',
    (_name, source, update) => {
      const fields = Object.keys(update.shape).slice(1);
      expect(Object.keys(update.shape)[0]).toBe('version');
      for (const key of fields) {
        const field = update.shape[key as keyof typeof update.shape];
        expect(field.safeParse(undefined).success, key).toBe(true);
        expect(core(field), key).toBe(
          core(source.shape[key as keyof typeof source.shape]),
        );
      }
    },
  );

  it('create fills defaults and an update needs only the version', () => {
    expect(CreatePostRequestSchema.parse({})).toMatchObject({
      title: 'Untitled',
      excerpt: '',
      tags: [],
      projectIds: [],
    });
    expect(CreateProjectRequestSchema.parse({ name: 'P' })).toMatchObject({
      pitch: '',
      stage: 'idea',
      order: 0,
    });
    expect(UpdateProjectRequestSchema.parse({ version: 3 })).toEqual({
      version: 3,
    });
    expect(UpdatePostRequestSchema.safeParse({ title: 'x' }).success).toBe(
      false,
    );
  });
});

describe('VersionSchema and PageLimitSchema', () => {
  it('every version field is VersionSchema', () => {
    for (const shape of [
      ExpectedVersionRequestSchema.shape,
      PublishableFieldsSchema.shape,
      UpdatePostRequestSchema.shape,
      UpdateProjectRequestSchema.shape,
      UpdateHomeRequestSchema.shape,
      UpdateResumeRequestSchema.shape,
      NoteSchema.shape,
      TaskSchema.shape,
      UpdateNoteRequestSchema.shape,
      UpdateTaskRequestSchema.shape,
      UpsertDailyNoteRequestSchema.shape,
    ]) {
      expect(core(shape.version)).toBe(VersionSchema);
    }
  });

  it('every page-size query is PageLimitSchema', () => {
    for (const shape of [
      ListPostsQuerySchema.shape,
      ListNotesQuerySchema.shape,
      ListTasksQuerySchema.shape,
      SyncChangesQuerySchema.shape,
    ]) {
      expect(core(shape.limit)).toBe(PageLimitSchema);
    }
    expect(PageLimitSchema.parse('100')).toBe(100);
    expect(PageLimitSchema.safeParse('101').success).toBe(false);
    expect(PageLimitSchema.safeParse('0').success).toBe(false);
  });
});

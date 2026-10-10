import { describe, expect, it } from 'vitest';
import {
  NotebookSearchHitSchema,
  RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
  RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
  SYNC_CHANGE_TYPES,
} from '@gagnechris/shared';
import { COPY_BACK_TYPES } from '../src/restore/copy-back.js';
import { SEARCHED_TYPES } from '../src/search/service.js';

// A synced entity missing from any of these is silently skipped: not
// validated by the weekly restore test, not restorable, not searchable.
describe('every synced Notebook type is covered', () => {
  const lists: Record<string, readonly string[]> = {
    'restore-test schema checks (RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES)':
      RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
    'restore-test count floor (RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES)':
      RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
    'copy-back (COPY_BACK_TYPES)': COPY_BACK_TYPES,
    'search (SEARCHED_TYPES)': SEARCHED_TYPES,
    'search hit schema (NotebookSearchHitSchema.type)':
      NotebookSearchHitSchema.shape.type.options,
  };

  for (const [name, list] of Object.entries(lists)) {
    it(name, () => {
      expect(SYNC_CHANGE_TYPES.filter((t) => !list.includes(t))).toEqual([]);
    });
  }
});

// Publishable site types are not synced, so the list above misses them.
describe('every publishable site type is restore-tested', () => {
  it.each(['post', 'project', 'home', 'resume'])('%s', (type) => {
    expect(RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES).toContain(type);
    expect(RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES).toContain(type);
  });
});

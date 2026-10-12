import { describe, expect, it } from 'vitest';
import { NotebookSearchHitSchema, SYNC_CHANGE_TYPES } from '@gagnechris/shared';
import {
  RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
  RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
} from '@gagnechris/shared/server';
import { COPY_BACK_TYPES } from '../src/copy-back.js';

// A synced entity missing from any of these is silently skipped: not
// validated by the weekly restore test, not restorable, not searchable. The
// Go sync feed's adapters are checked against the same list in Go.
describe('every synced Notebook type is covered', () => {
  const lists: Record<string, readonly string[]> = {
    'restore-test schema checks (RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES)':
      RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES,
    'restore-test count floor (RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES)':
      RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES,
    'copy-back (COPY_BACK_TYPES)': COPY_BACK_TYPES,
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

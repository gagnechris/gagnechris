import { describe, expect, it } from 'vitest';
import {
  COUNT_FLOOR_ENTITY_TYPES,
  SCHEMA_CHECKED_ENTITY_TYPES,
} from '@gagnechris/restore-test/validate';
import { NotebookSearchHitSchema, SYNC_CHANGE_TYPES } from '@gagnechris/shared';
import { COPY_BACK_TYPES } from '../src/restore/copy-back.js';
import { SEARCHED_TYPES } from '../src/search/service.js';

// A synced entity missing from any of these is silently skipped: not
// validated by the weekly restore test, not restorable, not searchable.
describe('every synced Notebook type is covered', () => {
  const lists: Record<string, readonly string[]> = {
    'restore-test schema checks (services/restore-test ENTITY_RULES)':
      SCHEMA_CHECKED_ENTITY_TYPES,
    'restore-test count floor (COUNT_FLOOR_ENTITY_TYPES)':
      COUNT_FLOOR_ENTITY_TYPES,
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

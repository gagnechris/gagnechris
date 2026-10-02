import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSyncEntities,
  getSyncAdapter,
  listSyncChangeTypes,
} from '../src/sync/registry.js';
import {
  createFakeNotesRepo,
  FAKE_NOTE_CHANGE_TYPE,
  registerFakeNoteSync,
} from './support/fake-note.js';
import { createMemoryDoc } from './support/memory-doc.js';

describe('sync adapter registration (CHR-172)', () => {
  beforeEach(() => {
    clearSyncEntities();
  });

  it('registers adapters from repository sync.toChange on construct', () => {
    expect(getSyncAdapter(FAKE_NOTE_CHANGE_TYPE)).toBeUndefined();
    const { doc } = createMemoryDoc();
    createFakeNotesRepo(doc, 'gagnechris-test');
    expect(getSyncAdapter(FAKE_NOTE_CHANGE_TYPE)?.changeType).toBe(
      FAKE_NOTE_CHANGE_TYPE,
    );
    expect(listSyncChangeTypes()).toContain(FAKE_NOTE_CHANGE_TYPE);
  });

  it('fails when a synced change type has no registered adapter', () => {
    const expected = [FAKE_NOTE_CHANGE_TYPE] as const;
    // Simulate forgetting registerSyncEntity / sync.toChange.
    clearSyncEntities();
    expect(() => {
      for (const changeType of expected) {
        if (!getSyncAdapter(changeType)) {
          throw new Error(`missing sync adapter: ${changeType}`);
        }
      }
    }).toThrow(/missing sync adapter: fakeNote/);

    registerFakeNoteSync();
    for (const changeType of expected) {
      expect(getSyncAdapter(changeType)).toBeDefined();
    }
  });
});

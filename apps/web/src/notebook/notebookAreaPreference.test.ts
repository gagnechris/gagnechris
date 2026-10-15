import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  NOTEBOOK_AREA_STORAGE_KEY,
  readStoredNotebookArea,
  writeStoredNotebookArea,
} from './notebookAreaPreference';

describe('notebookAreaPreference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('reads nothing when unset', () => {
    expect(readStoredNotebookArea()).toBeNull();
  });

  test('write then read round-trips any area id', () => {
    writeStoredNotebookArea('family');
    expect(localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY)).toBe('family');
    expect(readStoredNotebookArea()).toBe('family');
  });

  test('read survives localStorage getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredNotebookArea()).toBeNull();
  });
});

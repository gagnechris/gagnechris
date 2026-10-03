import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_NOTEBOOK_AREA_FILTER,
  NOTEBOOK_AREA_STORAGE_KEY,
  areaQueryParam,
  isNotebookAreaFilter,
  readNotebookAreaFilter,
  writeNotebookAreaFilter,
} from './notebookAreaPreference';

describe('notebookAreaPreference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('isNotebookAreaFilter accepts work / personal / all only', () => {
    expect(isNotebookAreaFilter('work')).toBe(true);
    expect(isNotebookAreaFilter('personal')).toBe(true);
    expect(isNotebookAreaFilter('all')).toBe(true);
    expect(isNotebookAreaFilter('home')).toBe(false);
    expect(isNotebookAreaFilter(null)).toBe(false);
  });

  test('read defaults to work when unset or invalid', () => {
    expect(readNotebookAreaFilter()).toBe(DEFAULT_NOTEBOOK_AREA_FILTER);
    localStorage.setItem(NOTEBOOK_AREA_STORAGE_KEY, 'nope');
    expect(readNotebookAreaFilter()).toBe(DEFAULT_NOTEBOOK_AREA_FILTER);
  });

  test('write then read round-trips', () => {
    writeNotebookAreaFilter('personal');
    expect(localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY)).toBe('personal');
    expect(readNotebookAreaFilter()).toBe('personal');
    writeNotebookAreaFilter('all');
    expect(readNotebookAreaFilter()).toBe('all');
  });

  test('read survives localStorage getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readNotebookAreaFilter()).toBe(DEFAULT_NOTEBOOK_AREA_FILTER);
  });

  test('areaQueryParam omits area for all', () => {
    expect(areaQueryParam('work')).toBe('work');
    expect(areaQueryParam('personal')).toBe('personal');
    expect(areaQueryParam('all')).toBeUndefined();
  });
});

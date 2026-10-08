import {
  DEFAULT_NOTEBOOK_AREA_FILTER,
  isNotebookAreaFilter,
  NOTEBOOK_AREA_STORAGE_KEY,
  type NotebookAreaFilter,
} from '@gagnechris/shared';

export {
  areaForNewItem,
  areaQueryParam,
  DEFAULT_NOTEBOOK_AREA_FILTER,
  isNotebookAreaFilter,
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_HEADINGS,
  NOTEBOOK_AREA_LABELS,
  NOTEBOOK_AREA_STORAGE_KEY,
  type NotebookAreaFilter,
} from '@gagnechris/shared';

export function readNotebookAreaFilter(): NotebookAreaFilter {
  try {
    const raw = localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY);
    if (isNotebookAreaFilter(raw)) return raw;
  } catch {
    // private mode / blocked storage
  }
  return DEFAULT_NOTEBOOK_AREA_FILTER;
}

export function writeNotebookAreaFilter(filter: NotebookAreaFilter): void {
  try {
    localStorage.setItem(NOTEBOOK_AREA_STORAGE_KEY, filter);
  } catch {
    // private mode / blocked storage
  }
}

import type { NotebookArea } from '@gagnechris/shared';

/** UI filter; `'all'` omits `area` on list APIs (not part of NotebookArea). */
export type NotebookAreaFilter = NotebookArea | 'all';

export const NOTEBOOK_AREA_FILTERS = [
  'work',
  'personal',
  'all',
] as const satisfies readonly NotebookAreaFilter[];

export const NOTEBOOK_AREA_LABELS: Record<NotebookAreaFilter, string> = {
  work: 'Work',
  personal: 'Personal',
  all: 'All',
};

export const NOTEBOOK_AREA_STORAGE_KEY = 'gagnechris.notebook.areaFilter';

export const DEFAULT_NOTEBOOK_AREA_FILTER: NotebookAreaFilter = 'work';

export function isNotebookAreaFilter(
  value: unknown,
): value is NotebookAreaFilter {
  return value === 'work' || value === 'personal' || value === 'all';
}

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

export function areaQueryParam(
  filter: NotebookAreaFilter,
): NotebookArea | undefined {
  return filter === 'all' ? undefined : filter;
}

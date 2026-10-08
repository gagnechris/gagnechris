import type { NotebookArea } from './schemas.js';

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

/** Page kickers: which notebook the page shows. */
export const NOTEBOOK_AREA_HEADINGS: Record<NotebookAreaFilter, string> = {
  work: 'Work notebook',
  personal: 'Personal notebook',
  all: 'All areas',
};

/** The web's localStorage key and the iOS app's AsyncStorage key. */
export const NOTEBOOK_AREA_STORAGE_KEY = 'gagnechris.notebook.areaFilter';

export const DEFAULT_NOTEBOOK_AREA_FILTER: NotebookAreaFilter = 'work';

export function isNotebookAreaFilter(
  value: unknown,
): value is NotebookAreaFilter {
  return value === 'work' || value === 'personal' || value === 'all';
}

export function areaQueryParam(
  filter: NotebookAreaFilter,
): NotebookArea | undefined {
  return filter === 'all' ? undefined : filter;
}

/** New notes and tasks go to the filtered area; All means Work. */
export function areaForNewItem(filter: NotebookAreaFilter): NotebookArea {
  return filter === 'personal' ? 'personal' : 'work';
}

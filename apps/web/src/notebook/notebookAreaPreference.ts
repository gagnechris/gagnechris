import { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';

export { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';

/** The last area chosen on this device, which may no longer be one of the user's. */
export function readStoredNotebookArea(): string | null {
  try {
    return localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY);
  } catch {
    // private mode / blocked storage
    return null;
  }
}

export function writeStoredNotebookArea(area: string): void {
  try {
    localStorage.setItem(NOTEBOOK_AREA_STORAGE_KEY, area);
  } catch {
    // private mode / blocked storage
  }
}

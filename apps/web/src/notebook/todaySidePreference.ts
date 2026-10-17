import { breakpoint } from '@gagnechris/tokens';

const TODAY_SIDE_STORAGE_KEY = 'gagnechris.notebook.todaySide';

/** Above the tab bar, below `breakpoint.wider`. */
export const TODAY_OVERLAY_QUERY = `(min-width: ${breakpoint.tabBar + 1}px) and (max-width: ${breakpoint.wider - 1}px)`;

export function readTodaySideOpen(): boolean {
  try {
    return localStorage.getItem(TODAY_SIDE_STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

export function writeTodaySideOpen(open: boolean): void {
  try {
    localStorage.setItem(TODAY_SIDE_STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // private mode / blocked storage
  }
}

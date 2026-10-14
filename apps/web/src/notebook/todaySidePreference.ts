const TODAY_SIDE_STORAGE_KEY = 'gagnechris.notebook.todaySide';

/** Above the tab bar, below `breakpoint.wider` in @gagnechris/tokens. */
export const TODAY_OVERLAY_QUERY = '(min-width: 768px) and (max-width: 1099px)';

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

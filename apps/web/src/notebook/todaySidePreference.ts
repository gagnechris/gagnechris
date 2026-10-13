const TODAY_SIDE_STORAGE_KEY = 'gagnechris.notebook.todaySide';

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

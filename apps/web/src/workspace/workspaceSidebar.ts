const storageKey = (app: string) => `gagnechris.${app}.sidebar`;

export function readSidebarOpen(app: string): boolean {
  try {
    return localStorage.getItem(storageKey(app)) !== 'closed';
  } catch {
    return true;
  }
}

export function writeSidebarOpen(app: string, open: boolean): void {
  try {
    localStorage.setItem(storageKey(app), open ? 'open' : 'closed');
  } catch {
    // private mode / blocked storage
  }
}

export const isSidebarShortcut = (e: KeyboardEvent): boolean =>
  (e.metaKey || e.ctrlKey) &&
  !e.altKey &&
  !e.shiftKey &&
  (e.key === '\\' || e.code === 'Backslash');

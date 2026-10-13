import { useSyncExternalStore } from 'react';

/** Open task details, folded subtasks and the notes that peek, on this device only. */
export const TASK_DETAILS_OPEN_KEY = 'notebook.taskDetails.open';
export const TASK_PEEK_NOTES_KEY = 'notebook.taskDetails.peek';
export const TASK_FOLDED_KEY = 'notebook.taskDetails.folded';

// Oldest entries drop first, so the lists stay small however long it's used.
const MAX_IDS = 500;

type Store = {
  open: ReadonlySet<string>;
  peek: ReadonlySet<string>;
  folded: ReadonlySet<string>;
};

function read(key: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function write(key: string, ids: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-MAX_IDS)));
  } catch {
    // Private mode or full storage: the state lasts until reload.
  }
}

let store: Store | null = null;
const listeners = new Set<() => void>();

const current = (): Store =>
  (store ??= {
    open: read(TASK_DETAILS_OPEN_KEY),
    peek: read(TASK_PEEK_NOTES_KEY),
    folded: read(TASK_FOLDED_KEY),
  });

function update(next: Partial<Store>) {
  store = { ...current(), ...next };
  if (next.open) write(TASK_DETAILS_OPEN_KEY, next.open);
  if (next.peek) write(TASK_PEEK_NOTES_KEY, next.peek);
  if (next.folded) write(TASK_FOLDED_KEY, next.folded);
  for (const listener of listeners) listener();
}

const withIds = (
  set: ReadonlySet<string>,
  ids: readonly string[],
  on: boolean,
) => {
  const next = new Set(set);
  for (const id of ids) {
    next.delete(id);
    if (on) next.add(id);
  }
  return next;
};

export function setTaskDetailsOpen(ids: readonly string[], open: boolean) {
  update({ open: withIds(current().open, ids, open) });
}

export function toggleTaskDetails(id: string) {
  setTaskDetailsOpen([id], !current().open.has(id));
}

export function toggleTaskFold(id: string) {
  const { folded } = current();
  update({ folded: withIds(folded, [id], !folded.has(id)) });
}

export function setNotePeek(noteId: string, peek: boolean) {
  update({ peek: withIds(current().peek, [noteId], peek) });
}

/** Re-reads storage; for tests. */
export function resetTaskDetailsStore() {
  store = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === TASK_DETAILS_OPEN_KEY ||
      e.key === TASK_PEEK_NOTES_KEY ||
      e.key === TASK_FOLDED_KEY
    ) {
      store = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTaskDetailsStore(): Store {
  return useSyncExternalStore(subscribe, current, current);
}

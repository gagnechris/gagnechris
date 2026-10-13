import { useSyncExternalStore } from 'react';
import type { KeyValueStore } from '../area';

/** Open task details and the notes that peek, on this phone only. */
export const TASK_DETAILS_OPEN_KEY = 'gagnechris.notebook.taskDetails.open';
export const TASK_PEEK_NOTES_KEY = 'gagnechris.notebook.taskDetails.peek';

// Oldest entries drop first, so the lists stay small however long it's used.
const MAX_IDS = 500;

type Store = { open: ReadonlySet<string>; peek: ReadonlySet<string> };

const EMPTY: Store = { open: new Set(), peek: new Set() };

let store: Store = EMPTY;
let storage: KeyValueStore | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const parseIds = (raw: string | null): string[] => {
  try {
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
};

/** Loads the saved state; changes made before it loads win. */
export async function loadTaskDetailsStore(from: KeyValueStore) {
  storage = from;
  const [open, peek] = await Promise.all(
    [TASK_DETAILS_OPEN_KEY, TASK_PEEK_NOTES_KEY].map((key) =>
      from.getItem(key).then(parseIds, () => []),
    ),
  );
  if (store !== EMPTY) return;
  store = { open: new Set(open), peek: new Set(peek) };
  emit();
}

const write = (key: string, ids: ReadonlySet<string>) =>
  void storage
    ?.setItem(key, JSON.stringify([...ids].slice(-MAX_IDS)))
    .catch(() => {
      // Not persisted; the state still holds for this run.
    });

const withId = (set: ReadonlySet<string>, id: string, on: boolean) => {
  const next = new Set(set);
  next.delete(id);
  if (on) next.add(id);
  return next;
};

export function toggleTaskDetails(taskId: string) {
  const open = withId(store.open, taskId, !store.open.has(taskId));
  store = { ...store, open };
  write(TASK_DETAILS_OPEN_KEY, open);
  emit();
}

export function setNotePeek(noteId: string, peek: boolean) {
  const next = withId(store.peek, noteId, peek);
  store = { ...store, peek: next };
  write(TASK_PEEK_NOTES_KEY, next);
  emit();
}

/** Sign-out and tests: forgets the state held in memory. */
export function resetTaskDetailsStore() {
  store = EMPTY;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const taskDetailsSnapshot = (): Store => store;

export const useTaskDetailsStore = (): Store =>
  useSyncExternalStore(subscribe, taskDetailsSnapshot, taskDetailsSnapshot);

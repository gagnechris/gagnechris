import { useSyncExternalStore } from 'react';
import type { KeyValueStore } from '../area';

/** Open task details, folded subtasks and the notes that peek, on this phone only. */
export const TASK_DETAILS_OPEN_KEY = 'gagnechris.notebook.taskDetails.open';
export const TASK_PEEK_NOTES_KEY = 'gagnechris.notebook.taskDetails.peek';
export const TASK_FOLDED_KEY = 'gagnechris.notebook.taskDetails.folded';

// Oldest entries drop first, so the lists stay small however long it's used.
const MAX_IDS = 500;

type Store = {
  open: ReadonlySet<string>;
  peek: ReadonlySet<string>;
  folded: ReadonlySet<string>;
};

const KEYS: Record<keyof Store, string> = {
  open: TASK_DETAILS_OPEN_KEY,
  peek: TASK_PEEK_NOTES_KEY,
  folded: TASK_FOLDED_KEY,
};

const EMPTY: Store = { open: new Set(), peek: new Set(), folded: new Set() };

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
  const sets = await Promise.all(
    [KEYS.open, KEYS.peek, KEYS.folded].map((key) =>
      from.getItem(key).then(parseIds, () => []),
    ),
  );
  if (store !== EMPTY) return;
  const [open, peek, folded] = sets.map((ids) => new Set(ids));
  store = { open: open!, peek: peek!, folded: folded! };
  emit();
}

const setHas = (name: keyof Store, id: string, on: boolean) => {
  const next = new Set(store[name]);
  next.delete(id);
  if (on) next.add(id);
  store = { ...store, [name]: next };
  void storage
    ?.setItem(KEYS[name], JSON.stringify([...next].slice(-MAX_IDS)))
    .catch(() => {
      // Not persisted; the state still holds for this run.
    });
  emit();
};

export const toggleTaskDetails = (taskId: string) =>
  setHas('open', taskId, !store.open.has(taskId));

export const toggleTaskFold = (taskId: string) =>
  setHas('folded', taskId, !store.folded.has(taskId));

export const setNotePeek = (noteId: string, peek: boolean) =>
  setHas('peek', noteId, peek);

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

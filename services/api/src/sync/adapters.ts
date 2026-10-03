/**
 * Every production synced entity type, in one place (CHR-202).
 * Registration is explicit (routes.ts calls {@link registerProductionSyncAdapters})
 * rather than a side effect of importing or constructing a repository, so a
 * cold Lambda always knows every `SyncChangeSchema` type before the first poll.
 * Adding a synced entity: one entry here + its variant in `SyncChangeSchema`
 * (the routes test fails until both match).
 */
import { NOTE_CHANGE_TYPE, noteToChange } from '../notes/repository.js';
import { TASK_CHANGE_TYPE, taskToChange } from '../tasks/repository.js';
import { registerSyncEntity, type SyncEntityAdapter } from './registry.js';

export const PRODUCTION_SYNC_ADAPTERS: readonly SyncEntityAdapter[] = [
  { changeType: NOTE_CHANGE_TYPE, toChange: noteToChange },
  { changeType: TASK_CHANGE_TYPE, toChange: taskToChange },
];

/** Idempotent; tests call it again after `clearSyncEntities()`. */
export function registerProductionSyncAdapters(): void {
  for (const adapter of PRODUCTION_SYNC_ADAPTERS) {
    registerSyncEntity(adapter);
  }
}

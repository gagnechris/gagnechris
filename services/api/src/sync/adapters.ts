/**
 * Registration is explicit rather than an import side effect, so a cold Lambda
 * knows every `SyncChangeSchema` type before the first poll.
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

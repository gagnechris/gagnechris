/**
 * Sync change-feed adapters keyed by entity `changeType` (CHR-153).
 * Repositories register themselves via VersionedEntityConfig.sync; the feed
 * never hard-codes entity modules.
 */
import type { SyncChange } from '@gagnechris/shared';

export type SyncEntityAdapter = {
  /** Must match VersionedEntityConfig.sync.changeType / item.entityType. */
  changeType: string;
  /**
   * Map a projected META item (from the sync GSI) to a SyncChange.
   * Return undefined to skip unrecognized / corrupt rows.
   */
  toChange: (item: Record<string, unknown>) => SyncChange | undefined;
};

const adapters = new Map<string, SyncEntityAdapter>();

/** Register (or replace) a sync entity adapter. Safe to call from test setup. */
export function registerSyncEntity(adapter: SyncEntityAdapter): void {
  adapters.set(adapter.changeType, adapter);
}

/** Remove an adapter (tests). */
export function unregisterSyncEntity(changeType: string): void {
  adapters.delete(changeType);
}

/** Clear all adapters (tests). */
export function clearSyncEntities(): void {
  adapters.clear();
}

export function getSyncAdapter(
  changeType: string,
): SyncEntityAdapter | undefined {
  return adapters.get(changeType);
}

export function listSyncChangeTypes(): string[] {
  return [...adapters.keys()];
}

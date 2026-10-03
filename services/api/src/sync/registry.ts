/**
 * Sync change-feed adapters keyed by entity `changeType` (CHR-153 / CHR-202).
 * Production adapters are listed explicitly in `sync/adapters.ts` and
 * registered from routes.ts; tests may register fixture adapters here.
 */

/**
 * Wire shape every adapter emits. Production changes are a `SyncChange`; test
 * fixtures (e.g. `fakeNote`) use the same shape outside the production union.
 */
export type SyncFeedChange = {
  type: string;
  id: string;
  version: number;
  deleted: boolean;
  updatedAt: string;
  entity?: unknown;
};

export type SyncEntityAdapter = {
  /** Must match VersionedEntityConfig.sync.changeType / item.entityType. */
  changeType: string;
  /**
   * Map a projected META item (from the sync GSI) to a change.
   * Return undefined to skip unrecognized / corrupt rows.
   */
  toChange: (item: Record<string, unknown>) => SyncFeedChange | undefined;
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

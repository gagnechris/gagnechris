/** Wider than `SyncChange` so test fixtures can use the same shape. */
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
  /** Undefined skips the row; build it with `toSyncChange` so corrupt rows are logged and counted. */
  toChange: (item: Record<string, unknown>) => SyncFeedChange | undefined;
};

const adapters = new Map<string, SyncEntityAdapter>();

export function registerSyncEntity(adapter: SyncEntityAdapter): void {
  adapters.set(adapter.changeType, adapter);
}

export function unregisterSyncEntity(changeType: string): void {
  adapters.delete(changeType);
}

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

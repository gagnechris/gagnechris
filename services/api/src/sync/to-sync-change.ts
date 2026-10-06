import type { ZodType } from 'zod';
import { logCorruptStoredItem } from '../data/corrupt-item.js';
import { DataIntegrityError } from '../data/errors.js';
import type { SyncFeedChange } from './registry.js';

type SyncedEntity = {
  id: string;
  version: number;
  deleted: boolean;
  updatedAt: string;
};

/**
 * A feed adapter for one change type. A row that fails `parse` or `schema`
 * is logged with its keys and counted as `SyncCorruptRow`, then skipped
 * (see the ledger for why it is skipped rather than failing the page).
 */
export function toSyncChange<T extends SyncedEntity, C extends SyncFeedChange>(
  changeType: string,
  parse: (item: Record<string, unknown>) => T,
  schema: ZodType<C>,
): (item: Record<string, unknown>) => C | undefined {
  return (item) => {
    if (item.entityType !== changeType) return undefined;
    try {
      const entity = parse(item);
      return schema.parse({
        type: changeType,
        id: entity.id,
        version: entity.version,
        deleted: entity.deleted,
        updatedAt: entity.updatedAt,
        ...(entity.deleted ? {} : { entity }),
      });
    } catch (error) {
      logCorruptStoredItem(
        new DataIntegrityError(`Corrupt sync row (${changeType})`, {
          pk: typeof item.pk === 'string' ? item.pk : undefined,
          sk: typeof item.sk === 'string' ? item.sk : undefined,
          cause: error,
        }),
        'SyncCorruptRow',
      );
      return undefined;
    }
  };
}

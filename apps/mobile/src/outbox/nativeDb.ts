import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite';

export const OUTBOX_DB_NAME = 'notebook-outbox.db';

export const openOutboxDb = () => openDatabaseAsync(OUTBOX_DB_NAME);

/** Sign-out deletes the file rather than its rows, so no deleted text stays in free pages. */
export const deleteOutboxDb = async () => {
  try {
    await deleteDatabaseAsync(OUTBOX_DB_NAME);
  } catch {
    // Never opened on this install.
  }
};

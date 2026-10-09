/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

type BindValue = string | number | null;

/** Named databases outlive a close, as files would; delete removes one. */
export const databases = new Map<string, DatabaseSync>();

const wrap = (db: DatabaseSync) => {
  let closed = false;
  const live = () => {
    if (closed) throw new Error('Database is closed');
    return db;
  };
  return {
    execAsync: async (sql: string) => {
      live().exec(sql);
    },
    runAsync: async (sql: string, ...params: BindValue[]) => {
      const result = live()
        .prepare(sql)
        .run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    getAllAsync: async <T>(sql: string, ...params: BindValue[]) =>
      live()
        .prepare(sql)
        .all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: BindValue[]) =>
      (live()
        .prepare(sql)
        .get(...params) as T | undefined) ?? null,
    withTransactionAsync: async (task: () => Promise<void>) => {
      live().exec('BEGIN');
      try {
        await task();
        live().exec('COMMIT');
      } catch (error) {
        live().exec('ROLLBACK');
        throw error;
      }
    },
    closeAsync: async () => {
      closed = true;
    },
  };
};

/** expo-sqlite's async API over Node's built-in SQLite. */
export const expoSqlite = {
  openDatabaseAsync: async (name: string) => {
    let db = databases.get(name);
    if (!db) {
      db = new DatabaseSync(':memory:');
      databases.set(name, db);
    }
    return wrap(db);
  },
  deleteDatabaseAsync: async (name: string) => {
    const db = databases.get(name);
    if (!db) throw new Error(`No database ${name}`);
    db.close();
    databases.delete(name);
  },
};

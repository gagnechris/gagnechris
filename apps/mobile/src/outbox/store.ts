import type { Body, Op } from './ops';

type BindValue = string | number | null;

/** The part of expo-sqlite's `SQLiteDatabase` the outbox uses. */
export type OutboxDb = {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    ...params: BindValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, ...params: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: BindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
};

/**
 * Each entry upgrades from the version before it; never edit a shipped one,
 * because a phone may still hold unsent edits in that shape.
 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE ops (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'pending',
    status INTEGER,
    error TEXT
  )`,
  `ALTER TABLE ops ADD COLUMN base TEXT NOT NULL DEFAULT '{}'`,
];

export const OUTBOX_SCHEMA_VERSION = MIGRATIONS.length;

export const migrate = async (db: OutboxDb) => {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const from = row?.user_version ?? 0;
  if (from > MIGRATIONS.length) {
    throw new Error(`Outbox schema ${from} is newer than this app`);
  }
  for (let version = from; version < MIGRATIONS.length; version += 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]!);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
};

type Row = {
  seq: number;
  entity: string;
  entity_id: string;
  kind: string;
  method: string;
  path: string;
  body: string;
  sent: number;
  state: string;
  status: number | null;
  error: string | null;
  base: string;
};

const toOp = (row: Row): Op => ({
  seq: row.seq,
  entity: row.entity as Op['entity'],
  entityId: row.entity_id,
  kind: row.kind as Op['kind'],
  method: row.method as Op['method'],
  path: row.path,
  body: JSON.parse(row.body) as Body,
  base: JSON.parse(row.base) as Body,
  sent: row.sent === 1,
  state: row.state as Op['state'],
  status: row.status,
  error: row.error === null ? null : (JSON.parse(row.error) as unknown),
});

export const loadOps = async (db: OutboxDb): Promise<Op[]> =>
  (await db.getAllAsync<Row>('SELECT * FROM ops ORDER BY seq')).map(toOp);

export const insertOp = async (
  db: OutboxDb,
  op: Omit<Op, 'seq' | 'sent' | 'state' | 'status' | 'error'>,
): Promise<number> => {
  const result = await db.runAsync(
    'INSERT INTO ops (entity, entity_id, kind, method, path, body, base) VALUES (?, ?, ?, ?, ?, ?, ?)',
    op.entity,
    op.entityId,
    op.kind,
    op.method,
    op.path,
    JSON.stringify(op.body),
    JSON.stringify(op.base),
  );
  return result.lastInsertRowId;
};

export const rewriteOp = (
  db: OutboxDb,
  seq: number,
  body: Body,
  path: string,
  base: Body,
) =>
  db.runAsync(
    'UPDATE ops SET body = ?, path = ?, base = ? WHERE seq = ?',
    JSON.stringify(body),
    path,
    JSON.stringify(base),
    seq,
  );

/** A failed op goes back in line with the body the user chose. */
export const requeueOp = (db: OutboxDb, seq: number, body: Body) =>
  db.runAsync(
    "UPDATE ops SET body = ?, state = 'pending', status = NULL, error = NULL WHERE seq = ?",
    JSON.stringify(body),
    seq,
  );

export const markSent = (db: OutboxDb, seq: number) =>
  db.runAsync('UPDATE ops SET sent = 1 WHERE seq = ?', seq);

export const markFailed = (
  db: OutboxDb,
  seq: number,
  status: number,
  error: unknown,
) =>
  db.runAsync(
    "UPDATE ops SET state = 'failed', status = ?, error = ? WHERE seq = ?",
    status,
    JSON.stringify(error ?? null),
    seq,
  );

export const deleteOps = async (db: OutboxDb, seqs: readonly number[]) => {
  for (const seq of seqs) {
    await db.runAsync('DELETE FROM ops WHERE seq = ?', seq);
  }
};

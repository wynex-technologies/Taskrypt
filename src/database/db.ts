/**
 * A tiny async database facade with an explicit, serialized transaction model.
 *
 * expo-sqlite's `withTransactionAsync` does not stop unrelated queries from
 * interleaving inside an open transaction. Taskrypt's sync queue depends on
 * "write the row AND enqueue the operation" being atomic, so every statement is
 * funnelled through a single async mutex and transactions receive a dedicated
 * handle that runs inside the lock.
 */

export type SqlValue = string | number | null | Uint8Array;
export type SqlParams = SqlValue[];

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  first<T>(sql: string, params?: SqlParams): Promise<T | null>;
  /** Runs `fn` atomically. Use ONLY the provided `tx` handle inside. */
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/** Driver primitives that a concrete engine (expo-sqlite, node:sqlite) supplies. */
export interface DbDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlParams): Promise<{ changes: number }>;
  all<T>(sql: string, params: SqlParams): Promise<T[]>;
  first<T>(sql: string, params: SqlParams): Promise<T | null>;
  close(): Promise<void>;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async lock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function unlocked(driver: DbDriver): Db {
  const self: Db = {
    exec: (sql) => driver.exec(sql),
    run: (sql, params = []) => driver.run(sql, params),
    all: (sql, params = []) => driver.all(sql, params),
    first: (sql, params = []) => driver.first(sql, params),
    // Nested transactions use savepoints so helpers can compose.
    transaction: async (fn) => {
      const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
      await driver.exec(`SAVEPOINT ${sp}`);
      try {
        const r = await fn(self);
        await driver.exec(`RELEASE ${sp}`);
        return r;
      } catch (e) {
        await driver.exec(`ROLLBACK TO ${sp}`);
        await driver.exec(`RELEASE ${sp}`);
        throw e;
      }
    },
    close: () => driver.close(),
  };
  return self;
}

export function createDb(driver: DbDriver): Db {
  const mutex = new Mutex();
  const inner = unlocked(driver);
  let closed = false;

  const guard = () => {
    if (closed) throw new Error('Database is closed');
  };

  return {
    exec: (sql) => mutex.lock(async () => (guard(), inner.exec(sql))),
    run: (sql, params) => mutex.lock(async () => (guard(), inner.run(sql, params))),
    all: <T,>(sql: string, params?: SqlParams) => mutex.lock(async () => (guard(), inner.all<T>(sql, params))),
    first: <T,>(sql: string, params?: SqlParams) => mutex.lock(async () => (guard(), inner.first<T>(sql, params))),
    transaction: (fn) =>
      mutex.lock(async () => {
        guard();
        await driver.exec('BEGIN IMMEDIATE');
        try {
          const r = await fn(inner);
          await driver.exec('COMMIT');
          return r;
        } catch (e) {
          await driver.exec('ROLLBACK');
          throw e;
        }
      }),
    close: () =>
      mutex.lock(async () => {
        if (closed) return;
        closed = true;
        await driver.close();
      }),
  };
}

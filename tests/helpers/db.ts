/* eslint-disable @typescript-eslint/no-require-imports */
import { closeDatabase, openUserDatabase, setDriverFactory } from '@/database';
import type { DbDriver, SqlParams } from '@/database/db';
import { resetDeviceIdCache } from '@/repositories/kvRepository';

type NodeSqlite = {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { run(...p: unknown[]): { changes: number | bigint }; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown };
    close(): void;
  };
};

const { DatabaseSync } = require('node:sqlite') as NodeSqlite;

/** Real SQLite (node:sqlite) behind the same driver contract as expo-sqlite. */
export function nodeDriver(): DbDriver & { destroy: () => void } {
  const db = new DatabaseSync(':memory:');
  const bind = (params: SqlParams) => params.map((p) => (p === undefined ? null : p));
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, params) => ({ changes: Number(db.prepare(sql).run(...bind(params)).changes) }),
    all: async <T,>(sql: string, params: SqlParams) => db.prepare(sql).all(...bind(params)).map((r) => ({ ...(r as object) })) as T[],
    first: async <T,>(sql: string, params: SqlParams) => {
      const r = db.prepare(sql).get(...bind(params));
      return (r ? { ...(r as object) } : null) as T | null;
    },
    // Closing keeps the in-memory DB so a "device" can be reopened later in the test.
    close: async () => undefined,
    destroy: () => db.close(),
  };
}

/** Persistent per-(device, file) databases, so tests can switch between phones. */
const store = new Map<string, ReturnType<typeof nodeDriver>>();
let device = 'phone-a';

setDriverFactory({
  open: async (name) => {
    const key = `${device}:${name}`;
    let d = store.get(key);
    if (!d) {
      d = nodeDriver();
      store.set(key, d);
    }
    return d;
  },
  remove: async (name) => {
    const key = `${device}:${name}`;
    store.get(key)?.destroy();
    store.delete(key);
  },
});

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';

export function databaseExists(name: string, onDevice = device) {
  return store.has(`${onDevice}:${name}`);
}

/** Open (or reopen) a user's database on a named device. */
export async function onDevice(name: string, userId = USER_A) {
  await closeDatabase();
  resetDeviceIdCache();
  device = name;
  return openUserDatabase(userId);
}

export async function resetAllDevices() {
  await closeDatabase();
  resetDeviceIdCache();
  for (const d of store.values()) d.destroy();
  store.clear();
  device = 'phone-a';
}

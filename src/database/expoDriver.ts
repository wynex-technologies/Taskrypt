import * as SQLite from 'expo-sqlite';

import type { DbDriver } from './db';

/** expo-sqlite implementation of the driver contract. */
export async function openExpoDriver(name: string): Promise<DbDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes };
    },
    all: (sql, params) => db.getAllAsync(sql, params),
    first: (sql, params) => db.getFirstAsync(sql, params),
    close: () => db.closeAsync(),
  };
}

export async function deleteExpoDatabase(name: string): Promise<void> {
  try {
    await SQLite.deleteDatabaseAsync(name);
  } catch {
    // Already gone — nothing to wipe.
  }
}

import { createLogger } from '@/lib/logger';

import { createDb, type Db, type DbDriver } from './db';
import { migrate } from './schema';

export type { Db } from './db';

const log = createLogger('db');

type DriverFactory = { open: (name: string) => Promise<DbDriver>; remove: (name: string) => Promise<void> };

let factory: DriverFactory | null = null;
let current: { userId: string; db: Db } | null = null;
let opening: Promise<Db> | null = null;

/** Tests inject node:sqlite here; the app lazily uses expo-sqlite. */
export function setDriverFactory(f: DriverFactory | null) {
  factory = f;
}

async function getFactory(): Promise<DriverFactory> {
  if (factory) return factory;
  const { openExpoDriver, deleteExpoDatabase } = await import('./expoDriver');
  factory = { open: openExpoDriver, remove: deleteExpoDatabase };
  return factory;
}

/** One database file per account so a different user signing in never sees stale rows. */
export function databaseNameFor(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid user id for database name');
  return `taskora_${userId.toLowerCase()}.db`;
}

export async function openUserDatabase(userId: string): Promise<Db> {
  if (current?.userId === userId) return current.db;
  if (opening) await opening.catch(() => undefined);
  if (current && current.userId !== userId) await closeDatabase();
  opening = (async () => {
    const f = await getFactory();
    const db = createDb(await f.open(databaseNameFor(userId)));
    await migrate(db);
    current = { userId, db };
    log.debug('opened user database');
    return db;
  })();
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

export function getDb(): Db {
  if (!current) throw new Error('No user database is open — the user is not signed in.');
  return current.db;
}

export function getOpenDbUserId(): string | null {
  return current?.userId ?? null;
}

export async function closeDatabase(): Promise<void> {
  const c = current;
  current = null;
  if (c) await c.db.close();
}

/** Close and permanently delete the user's local database file. */
export async function wipeUserDatabase(userId: string): Promise<void> {
  if (current?.userId === userId) await closeDatabase();
  const f = await getFactory();
  await f.remove(databaseNameFor(userId));
}

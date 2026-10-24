import type { Db } from '@/database/db';
import { uuid } from '@/lib/ids';

export async function kvGet(db: Db, key: string): Promise<string | null> {
  const row = await db.first<{ value: string | null }>('SELECT value FROM kv WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function kvSet(db: Db, key: string, value: string | null): Promise<void> {
  await db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

let cachedDeviceId: string | null = null;

/**
 * Stable per-install identifier (random, not a hardware id). Stored in the user's
 * database so it is wiped together with the user's local data.
 */
export async function getDeviceId(db: Db): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await kvGet(db, 'device_id');
  if (!id) {
    id = uuid();
    await kvSet(db, 'device_id', id);
  }
  cachedDeviceId = id;
  return id;
}

export function resetDeviceIdCache() {
  cachedDeviceId = null;
}

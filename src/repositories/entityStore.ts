import { emitChange } from '@/database/changes';
import type { Db } from '@/database/db';
import { getDb, getOpenDbUserId } from '@/database';
import { AppError } from '@/lib/errors';
import { nowIso } from '@/lib/time';
import type { SyncEntity, SyncedRow } from '@/types/domain';

import { buildUpsert, decodeRow, encodeRow, ENTITY_CONFIG, serverProjection } from './entities';
import { getDeviceId } from './kvRepository';
import { enqueueRow } from './syncQueueRepository';

export function requireUserId(): string {
  const id = getOpenDbUserId();
  if (!id) throw new AppError('unauthorized');
  return id;
}

export async function findById<T>(entity: SyncEntity, id: string, db: Db = getDb()): Promise<T | null> {
  const raw = await db.first<Record<string, unknown>>(`SELECT * FROM ${entity} WHERE id = ?`, [id]);
  return raw ? decodeRow<T>(entity, raw) : null;
}

export async function findAll<T>(entity: SyncEntity, where = 'deleted_at IS NULL', params: (string | number | null)[] = [], orderBy = 'created_at ASC', db: Db = getDb()): Promise<T[]> {
  const rows = await db.all<Record<string, unknown>>(`SELECT * FROM ${entity} WHERE ${where} ORDER BY ${orderBy}`, params);
  return rows.map((r) => decodeRow<T>(entity, r));
}

type Writable<T> = Omit<T, keyof SyncedRow> & Partial<Pick<SyncedRow, 'id' | 'deleted_at'>>;

/**
 * Write a record locally and enqueue its sync operation in ONE transaction.
 * Stamps ownership, the conflict clock and the device id.
 */
export async function saveRecord<T extends SyncedRow>(
  entity: SyncEntity,
  id: string,
  patch: Partial<Writable<T>> & Record<string, unknown>,
  options: { tx?: Db; localExtras?: Record<string, unknown>; silent?: boolean } = {},
): Promise<T> {
  const userId = requireUserId();
  const run = async (tx: Db) => {
    const deviceId = await getDeviceId(tx);
    const existing = await findById<T>(entity, id, tx);
    if (existing && existing.user_id !== userId) throw new AppError('permission_denied');
    const now = nowIso();
    // Strictly increasing per record even if the wall clock steps backwards.
    const clock = existing && existing.client_updated_at >= now ? new Date(new Date(existing.client_updated_at).getTime() + 1).toISOString() : now;
    const merged = {
      ...(existing ?? { created_at: now, updated_at: now, version: 0, deleted_at: null }),
      ...patch,
      ...(options.localExtras ?? {}),
      id,
      user_id: userId,
      client_updated_at: clock,
      last_modified_by: deviceId,
      sync_state: 'pending',
    } as Record<string, unknown>;
    const { sql, params } = buildUpsert(entity, encodeRow(entity, merged));
    await tx.run(sql, params);
    const snapshot = encodeForWire(entity, merged);
    await enqueueRow(tx, entity, id, merged.deleted_at ? 'delete' : 'upsert', snapshot);
    return decodeRow<T>(entity, merged);
  };
  const result = options.tx ? await run(options.tx) : await getDb().transaction(run);
  if (!options.silent) emitChange(ENTITY_CONFIG[entity].topic, 'sync');
  return result;
}

export async function softDelete(entity: SyncEntity, id: string, tx?: Db): Promise<void> {
  await saveRecord(entity, id, { deleted_at: nowIso() } as never, { tx });
}

/** Wire format: server columns only, booleans as booleans, JSON as objects. */
export function encodeForWire(entity: SyncEntity, row: Record<string, unknown>): Record<string, unknown> {
  const cfg = ENTITY_CONFIG[entity];
  const projected = serverProjection(entity, row);
  for (const k of cfg.booleans) if (k in projected) projected[k] = projected[k] === true || projected[k] === 1;
  for (const k of cfg.json) {
    if (typeof projected[k] === 'string') {
      try {
        projected[k] = JSON.parse(projected[k] as string);
      } catch {
        projected[k] = null;
      }
    }
  }
  return projected;
}

/**
 * Apply an authoritative server row locally. Device-only columns are untouched
 * because the upsert only names server columns.
 */
export async function applyServerRow(tx: Db, entity: SyncEntity, row: Record<string, unknown>): Promise<void> {
  const values = encodeRow(entity, { ...serverProjection(entity, row), sync_state: 'synced' });
  const { sql, params } = buildUpsert(entity, values);
  await tx.run(sql, params);
}

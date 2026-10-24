import type { Db } from '@/database/db';
import { uuid } from '@/lib/ids';
import { nowIso } from '@/lib/time';
import type { SyncEntity } from '@/types/domain';

export type QueueKind = 'row' | 'upload' | 'copy_object' | 'delete_object';
export type QueueStatus = 'pending' | 'inflight' | 'failed';

export type QueueItem = {
  op_id: string;
  kind: QueueKind;
  entity: SyncEntity;
  entity_id: string;
  op: string;
  payload: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  seq: number;
};

type RawQueueItem = Omit<QueueItem, 'payload'> & { payload: string };

export const MAX_ATTEMPTS = 8;

const decode = (r: RawQueueItem): QueueItem => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> });

async function nextSeq(tx: Db): Promise<number> {
  const r = await tx.first<{ s: number | null }>('SELECT MAX(seq) AS s FROM sync_queue');
  return (r?.s ?? 0) + 1;
}

/**
 * Enqueue a row snapshot. The payload is captured NOW so a retried operation is
 * byte-for-byte identical (idempotent on the server). A still-unsent row op for
 * the same record is coalesced in place; one already in flight is never mutated,
 * because the server may have applied it under its op_id.
 */
export async function enqueueRow(
  tx: Db,
  entity: SyncEntity,
  entityId: string,
  op: 'upsert' | 'delete',
  payload: Record<string, unknown>,
): Promise<string> {
  const existing = await tx.first<{ op_id: string }>(
    "SELECT op_id FROM sync_queue WHERE kind = 'row' AND entity = ? AND entity_id = ? AND status = 'pending' ORDER BY seq DESC LIMIT 1",
    [entity, entityId],
  );
  if (existing) {
    await tx.run('UPDATE sync_queue SET op = ?, payload = ?, attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE op_id = ?', [
      op,
      JSON.stringify(payload),
      existing.op_id,
    ]);
    return existing.op_id;
  }
  const opId = uuid();
  await tx.run(
    `INSERT INTO sync_queue (op_id, kind, entity, entity_id, op, payload, status, attempts, created_at, seq)
     VALUES (?, 'row', ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [opId, entity, entityId, op, JSON.stringify(payload), nowIso(), await nextSeq(tx)],
  );
  return opId;
}

export async function enqueueJob(
  tx: Db,
  kind: Exclude<QueueKind, 'row'>,
  entity: SyncEntity,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  // A record never needs two identical binary jobs (e.g. double-tapping "upload").
  const dup = await tx.first<{ op_id: string }>(
    "SELECT op_id FROM sync_queue WHERE kind = ? AND entity_id = ? AND status != 'inflight' LIMIT 1",
    [kind, entityId],
  );
  if (dup && kind !== 'delete_object') {
    await tx.run('UPDATE sync_queue SET payload = ?, status = ?, attempts = 0, next_attempt_at = NULL WHERE op_id = ?', [
      JSON.stringify(payload),
      'pending',
      dup.op_id,
    ]);
    return dup.op_id;
  }
  const opId = uuid();
  await tx.run(
    `INSERT INTO sync_queue (op_id, kind, entity, entity_id, op, payload, status, attempts, created_at, seq)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [opId, kind, entity, entityId, kind, JSON.stringify(payload), nowIso(), await nextSeq(tx)],
  );
  return opId;
}

export async function listReady(db: Db, kinds: QueueKind[], limit: number, now = nowIso()): Promise<QueueItem[]> {
  const placeholders = kinds.map(() => '?').join(',');
  const rows = await db.all<RawQueueItem>(
    `SELECT * FROM sync_queue
     WHERE kind IN (${placeholders}) AND status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY seq ASC LIMIT ?`,
    [...kinds, now, limit],
  );
  return rows.map(decode);
}

export async function listAll(db: Db): Promise<QueueItem[]> {
  return (await db.all<RawQueueItem>('SELECT * FROM sync_queue ORDER BY seq ASC')).map(decode);
}

export async function markInflight(db: Db, opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  await db.run(`UPDATE sync_queue SET status = 'inflight' WHERE op_id IN (${opIds.map(() => '?').join(',')})`, opIds);
}

export async function complete(db: Db, opIds: string[]): Promise<void> {
  if (opIds.length === 0) return;
  await db.run(`DELETE FROM sync_queue WHERE op_id IN (${opIds.map(() => '?').join(',')})`, opIds);
}

/** Exponential backoff with jitter: 2s, 4s, 8s … capped at 10 minutes. */
export function backoffMs(attempts: number, random = Math.random): number {
  const base = Math.min(600_000, 2000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}

export async function fail(db: Db, opId: string, error: string, retryable: boolean, now = Date.now()): Promise<void> {
  const row = await db.first<{ attempts: number }>('SELECT attempts FROM sync_queue WHERE op_id = ?', [opId]);
  const attempts = (row?.attempts ?? 0) + 1;
  const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
  await db.run('UPDATE sync_queue SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE op_id = ?', [
    giveUp ? 'failed' : 'pending',
    attempts,
    giveUp ? null : new Date(now + backoffMs(attempts)).toISOString(),
    error.slice(0, 300),
    opId,
  ]);
}

/** Crash recovery: anything left 'inflight' by a killed app is safe to resend (idempotent). */
export async function resetInflight(db: Db): Promise<void> {
  await db.run("UPDATE sync_queue SET status = 'pending' WHERE status = 'inflight'");
}

export async function retryFailed(db: Db): Promise<void> {
  await db.run("UPDATE sync_queue SET status = 'pending', attempts = 0, next_attempt_at = NULL WHERE status = 'failed'");
}

export async function discardFailed(db: Db): Promise<void> {
  await db.run("DELETE FROM sync_queue WHERE status = 'failed'");
}

export async function hasPendingFor(db: Db, entity: SyncEntity, entityId: string): Promise<boolean> {
  const r = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sync_queue WHERE kind = 'row' AND entity = ? AND entity_id = ?",
    [entity, entityId],
  );
  return (r?.n ?? 0) > 0;
}

export type QueueSummary = { pending: number; failed: number; uploads: number; inflight: number };

export async function summary(db: Db): Promise<QueueSummary> {
  const rows = await db.all<{ status: QueueStatus; kind: QueueKind; n: number }>(
    'SELECT status, kind, COUNT(*) AS n FROM sync_queue GROUP BY status, kind',
  );
  const s: QueueSummary = { pending: 0, failed: 0, uploads: 0, inflight: 0 };
  for (const r of rows) {
    if (r.status === 'failed') s.failed += r.n;
    else if (r.status === 'inflight') s.inflight += r.n;
    else s.pending += r.n;
    if (r.kind === 'upload' && r.status !== 'failed') s.uploads += r.n;
  }
  return s;
}

import { emitChange } from '@/database/changes';
import type { Db } from '@/database/db';
import { isAppError, toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { ENTITY_CONFIG } from '@/repositories/entities';
import { applyServerRow, findById } from '@/repositories/entityStore';
import { kvGet, kvSet } from '@/repositories/kvRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { SYNC_ENTITIES, type SyncEntity, type SyncedRow } from '@/types/domain';

import type { PushResult, SyncRemote } from './remote';

const log = createLogger('sync');

export const PUSH_BATCH = 100;
export const PULL_PAGE = 500;
/** Re-read this window behind the cursor to catch transactions that committed late. */
export const CURSOR_OVERLAP_MS = 5000;

const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'client_updated_at', 'deleted_at', 'due_at', 'completed_at'];

/** Postgres returns microsecond offsets; store everything as canonical ISO (ms, Z). */
export function normalizeServerRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const c of TIMESTAMP_COLUMNS) {
    const v = out[c];
    if (typeof v === 'string' && v) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) out[c] = d.toISOString();
    }
  }
  return out;
}

export type SyncHooks = {
  /** Binary jobs (upload / copy / delete object). Returns ids of jobs it handled. */
  processJobs?: (db: Db) => Promise<void>;
  /** Side effects for rows that changed because of the server (notifications, offline files). */
  onServerRows?: (entity: SyncEntity, rows: Record<string, unknown>[]) => Promise<void>;
};

export type SyncReport = {
  pushed: number;
  applied: number;
  stale: number;
  duplicate: number;
  rejected: number;
  pulled: number;
  errors: string[];
  finishedAt: string;
};

const emptyReport = (): SyncReport => ({ pushed: 0, applied: 0, stale: 0, duplicate: 0, rejected: 0, pulled: 0, errors: [], finishedAt: '' });

/**
 * Accept the server's row unless the user has edited the record again since the
 * op was sent — in that case the newer local op will be pushed and the server
 * will decide with the same deterministic rule.
 */
async function adoptServerRow(db: Db, entity: SyncEntity, row: Record<string, unknown>, exceptOpId?: string): Promise<boolean> {
  const id = String(row.id);
  const newer = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_queue WHERE kind = 'row' AND entity = ? AND entity_id = ? ${exceptOpId ? 'AND op_id != ?' : ''}`,
    exceptOpId ? [entity, id, exceptOpId] : [entity, id],
  );
  if ((newer?.n ?? 0) > 0) return false;
  await applyServerRow(db, entity, normalizeServerRow(row));
  return true;
}

export async function pushPending(db: Db, remote: SyncRemote, deviceId: string, report: SyncReport, hooks: SyncHooks = {}) {
  for (;;) {
    const batch = await queue.listReady(db, ['row'], PUSH_BATCH);
    if (batch.length === 0) return;
    await queue.markInflight(
      db,
      batch.map((b) => b.op_id),
    );
    let results: PushResult[];
    try {
      results = await remote.push(
        deviceId,
        batch.map((b) => ({ op_id: b.op_id, entity: b.entity, row: b.payload })),
      );
    } catch (e) {
      const err = toAppError(e);
      for (const b of batch) await queue.fail(db, b.op_id, err.message, err.retryable || err.code === 'session_expired');
      throw err;
    }
    report.pushed += batch.length;
    const byId = new Map(results.map((r) => [r.op_id, r]));
    const changed = new Map<SyncEntity, Record<string, unknown>[]>();

    for (const item of batch) {
      const r = byId.get(item.op_id);
      if (!r) {
        await queue.fail(db, item.op_id, 'missing result', true);
        continue;
      }
      if (r.status === 'rejected') {
        report.rejected++;
        report.errors.push(`${item.entity}: ${r.error ?? 'rejected'}`);
        await queue.fail(db, item.op_id, r.error ?? 'rejected', false);
        await db.run(`UPDATE ${item.entity} SET sync_state = 'failed' WHERE id = ?`, [item.entity_id]);
        continue;
      }
      report[r.status]++;
      await db.transaction(async (tx) => {
        if (r.row) {
          const adopted = await adoptServerRow(tx, item.entity, r.row, item.op_id);
          // A stale result means another device won; surface it for side effects.
          if (adopted && r.status === 'stale') {
            const list = changed.get(item.entity) ?? [];
            list.push(normalizeServerRow(r.row));
            changed.set(item.entity, list);
          }
        }
        await queue.complete(tx, [item.op_id]);
      });
    }
    for (const [entity, rows] of changed) await hooks.onServerRows?.(entity, rows);
    emitChange('sync', ...new Set(batch.map((b) => ENTITY_CONFIG[b.entity].topic)));
  }
}

function cursorKey(entity: SyncEntity) {
  return `cursor:${entity}`;
}

export async function pullChanges(db: Db, remote: SyncRemote, report: SyncReport, hooks: SyncHooks = {}) {
  for (const entity of SYNC_ENTITIES) {
    const cursor = await kvGet(db, cursorKey(entity));
    let since = cursor ? new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS).toISOString() : null;
    let maxSeen = cursor;
    for (;;) {
      const rows = await remote.pull(entity, since, PULL_PAGE);
      if (rows.length === 0) break;
      const applied: Record<string, unknown>[] = [];
      await db.transaction(async (tx) => {
        for (const raw of rows) {
          const row = normalizeServerRow(raw);
          const local = await findById<SyncedRow>(entity, String(row.id), tx);
          // Ignore echoes of a version we already hold.
          if (local && local.version >= Number(row.version) && local.client_updated_at === row.client_updated_at) continue;
          if (await adoptServerRow(tx, entity, row)) applied.push(row);
        }
      });
      report.pulled += applied.length;
      if (applied.length) {
        await hooks.onServerRows?.(entity, applied);
        emitChange(ENTITY_CONFIG[entity].topic);
      }
      const last = rows[rows.length - 1]!;
      const lastTs = normalizeServerRow(last).updated_at as string;
      if (!maxSeen || lastTs > maxSeen) maxSeen = lastTs;
      if (rows.length < PULL_PAGE) break;
      since = String(last.updated_at);
    }
    if (maxSeen && maxSeen !== cursor) await kvSet(db, cursorKey(entity), maxSeen);
  }
  await kvSet(db, 'last_pull_at', new Date().toISOString());
}

/**
 * One full sync pass: binary jobs → push rows → pull. Safe to call repeatedly;
 * concurrent callers share the in-flight run.
 */
let inflight: Promise<SyncReport> | null = null;

export function runSync(params: { db: Db; remote: SyncRemote; deviceId: string; hooks?: SyncHooks }): Promise<SyncReport> {
  if (inflight) return inflight;
  inflight = (async () => {
    const report = emptyReport();
    const { db, remote, deviceId, hooks = {} } = params;
    try {
      if (hooks.processJobs) {
        try {
          await hooks.processJobs(db);
        } catch (e) {
          report.errors.push(toAppError(e).userMessage);
        }
      }
      await pushPending(db, remote, deviceId, report, hooks);
      await pullChanges(db, remote, report, hooks);
      // Rows created by a job (e.g. a finished upload) during this pass.
      await pushPending(db, remote, deviceId, report, hooks);
      await kvSet(db, 'last_sync_at', new Date().toISOString());
      await kvSet(db, 'last_sync_error', null);
    } catch (e) {
      const err = toAppError(e);
      report.errors.push(err.userMessage);
      await kvSet(db, 'last_sync_error', err.userMessage).catch(() => undefined);
      if (!isAppError(e) || !err.retryable) log.warn('sync failed', { code: err.code });
      throw err;
    } finally {
      report.finishedAt = new Date().toISOString();
      emitChange('sync');
    }
    return report;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function isSyncRunning() {
  return inflight !== null;
}

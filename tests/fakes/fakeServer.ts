import type { PushOp, PushResult, SyncRemote } from '@/features/sync/remote';
import type { SyncEntity } from '@/types/domain';

/**
 * In-memory model of the server's `sync_push` contract (see the SQL migration):
 * idempotent op ids, owner forcing, server clock + version, and the
 * deterministic (client_updated_at, last_modified_by) last-writer-wins rule.
 * The PGlite tests check the real SQL implements the same behaviour.
 */
export class FakeServer {
  tables = new Map<SyncEntity, Map<string, Record<string, unknown>>>();
  ops = new Map<string, PushResult['status']>();
  private clock = Date.parse('2026-10-24T10:00:00.000Z');
  calls = { push: 0, pull: 0 };
  /** 'network' fails before applying; 'lostResponse' applies then fails. */
  failNext: 'network' | 'lostResponse' | null = null;
  rejectEntity: SyncEntity | null = null;

  constructor(public userId: string) {}

  table(e: SyncEntity) {
    let t = this.tables.get(e);
    if (!t) this.tables.set(e, (t = new Map()));
    return t;
  }

  rows(e: SyncEntity) {
    return [...this.table(e).values()];
  }

  private tick() {
    this.clock += 7;
    return new Date(this.clock).toISOString();
  }

  remote(): SyncRemote {
    return {
      push: async (deviceId: string, ops: PushOp[]) => {
        this.calls.push++;
        if (this.failNext === 'network') {
          this.failNext = null;
          throw Object.assign(new Error('Network request failed'), { name: 'TypeError' });
        }
        const results = ops.map((op) => this.apply(deviceId, op));
        if (this.failNext === 'lostResponse') {
          this.failNext = null;
          throw new Error('Network request failed');
        }
        return results;
      },
      pull: async (entity, since, limit) => {
        this.calls.pull++;
        return this.rows(entity)
          .filter((r) => !since || String(r.updated_at) > since)
          .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
          .slice(0, limit)
          .map((r) => ({ ...r }));
      },
    };
  }

  private apply(deviceId: string, op: PushOp): PushResult {
    const t = this.table(op.entity);
    const id = String(op.row.id);
    if (this.ops.has(op.op_id)) return { op_id: op.op_id, status: 'duplicate', row: t.get(id) ?? null };
    if (this.rejectEntity === op.entity) return { op_id: op.op_id, status: 'rejected', error: 'check constraint' };
    const incoming: Record<string, unknown> = { ...op.row, user_id: this.userId, last_modified_by: op.row.last_modified_by ?? deviceId };
    const existing = t.get(id);
    let status: PushResult['status'];
    if (!existing) {
      t.set(id, { ...incoming, version: 1, created_at: incoming.created_at ?? this.tick(), updated_at: this.tick() });
      status = 'applied';
    } else {
      const a = [String(existing.client_updated_at), String(existing.last_modified_by)];
      const b = [String(incoming.client_updated_at), String(incoming.last_modified_by)];
      const newer = b[0]! > a[0]! || (b[0] === a[0] && b[1]! > a[1]!);
      if (newer) {
        t.set(id, { ...existing, ...incoming, created_at: existing.created_at, version: Number(existing.version) + 1, updated_at: this.tick() });
        status = 'applied';
      } else status = 'stale';
    }
    this.ops.set(op.op_id, status);
    return { op_id: op.op_id, status, row: { ...t.get(id)! } };
  }

  /** Simulate a change made by another client directly on the server. */
  serverEdit(e: SyncEntity, id: string, patch: Record<string, unknown>) {
    const t = this.table(e);
    const row = t.get(id)!;
    t.set(id, { ...row, ...patch, version: Number(row.version) + 1, updated_at: this.tick() });
  }
}

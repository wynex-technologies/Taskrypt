import { toAppError } from '@/lib/errors';
import { getSupabase } from '@/services/supabase/client';
import type { SyncEntity } from '@/types/domain';

export type PushOp = { op_id: string; entity: SyncEntity; row: Record<string, unknown> };
export type PushResult = {
  op_id: string;
  status: 'applied' | 'stale' | 'duplicate' | 'rejected';
  row?: Record<string, unknown> | null;
  error?: string;
  code?: string;
};

/** Transport used by the sync engine. Swappable so the engine is unit-testable. */
export interface SyncRemote {
  push(deviceId: string, ops: PushOp[]): Promise<PushResult[]>;
  pull(entity: SyncEntity, since: string | null, limit: number): Promise<Record<string, unknown>[]>;
  registerDevice?(deviceId: string, info: { platform: string; appVersion: string }): Promise<void>;
}

export const supabaseRemote: SyncRemote = {
  async push(deviceId, ops) {
    const { data, error } = await getSupabase().rpc('sync_push', { p_device_id: deviceId, p_ops: ops });
    if (error) throw toAppError(error);
    return (data ?? []) as PushResult[];
  },

  async pull(entity, since, limit) {
    let q = getSupabase().from(entity).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return (data ?? []) as Record<string, unknown>[];
  },

  async registerDevice(deviceId, info) {
    const sb = getSupabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return;
    await sb.from('device_sync_state').upsert(
      { user_id: data.user.id, device_id: deviceId, platform: info.platform, app_version: info.appVersion, last_pulled_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' },
    );
  },
};
